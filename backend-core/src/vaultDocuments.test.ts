import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const { createApp } = await import("./app.js");
const { prisma } = await import("./db/prisma.js");
const { createVaultSalt } = await import("./services/cryptoService.js");
const { encodeJson } = await import("./services/jsonService.js");

const testRunId = `vault-documents-${Date.now()}`;
let server: Server;
let baseUrl = "";

before(async () => {
  server = createApp().listen(0);
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await prisma.activityLog.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.vaultDocument.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.vaultSchema.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

async function createUser(suffix: string) {
  const id = `${testRunId}-${suffix}`;
  return prisma.user.create({
    data: {
      id,
      email: `${id}@example.test`,
      vaultLocalPath: "test-vault",
      vaultEncryptionSalt: createVaultSalt()
    }
  });
}

async function createSchema(suffix: string) {
  return prisma.vaultSchema.create({
    data: {
      name: `${testRunId}-${suffix}`,
      description: "Vault document API test schema.",
      structuralTemplate: encodeJson({ fields: ["content"] })
    }
  });
}

async function api(path: string, input: { userId?: string; method?: string; body?: unknown } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: input.method ?? "GET",
    headers: {
      ...(input.userId ? { "x-user-id": input.userId } : {}),
      ...(input.body ? { "content-type": "application/json" } : {})
    },
    body: input.body ? JSON.stringify(input.body) : undefined
  });
}

test("vault document API creates manual entries with schema metadata and an activity receipt", async () => {
  const user = await createUser("create-user");
  const schema = await createSchema("Travel Notes");

  const response = await api("/api/vault/documents", {
    userId: user.id,
    method: "POST",
    body: {
      title: "Passport renewal reminder",
      vaultSchemaId: schema.id,
      content: "Renew my passport before the September family trip."
    }
  });

  assert.equal(response.status, 201);
  const payload = await response.json() as {
    document: {
      id: string;
      title: string;
      relativePath: string;
      frontmatter: { source: string; schema: string; content: string };
      vaultSchema: { id: string; name: string };
      embedding: number[];
      vectorProvider: string;
    };
  };
  assert.equal(payload.document.title, "Passport renewal reminder");
  assert.match(payload.document.relativePath, /^manual\/passport-renewal-reminder-/);
  assert.equal(payload.document.frontmatter.source, "manual-entry");
  assert.equal(payload.document.frontmatter.schema, schema.name);
  assert.equal(payload.document.vaultSchema.id, schema.id);
  // Embeddings are internal derived data and must not be exposed through the API.
  assert.deepEqual(payload.document.embedding, []);
  assert.equal(payload.document.vectorProvider, "local-hash");

  const storedDocument = await prisma.vaultDocument.findUniqueOrThrow({ where: { id: payload.document.id } });
  assert.notEqual(storedDocument.embedding, "[]");

  const receipt = await prisma.activityLog.findFirst({
    where: { userId: user.id, actionType: "vault_write", dataAccessed: payload.document.relativePath }
  });
  assert.ok(receipt);
});

test("vault document API rejects unknown schemas with a shared error shape", async () => {
  const user = await createUser("unknown-schema-user");

  const response = await api("/api/vault/documents", {
    userId: user.id,
    method: "POST",
    body: {
      title: "Unknown schema item",
      vaultSchemaId: `${testRunId}-missing-schema`,
      content: "This should not be saved because the schema is unknown."
    }
  });

  assert.equal(response.status, 400);
  const payload = await response.json() as { error: { message: string; code: string } };
  assert.equal(payload.error.message, "Unknown vault schema");
  assert.equal(payload.error.code, "unknown_vault_schema");
});

test("vault document API updates only owned entries and deletes with a receipt", async () => {
  const owner = await createUser("owner");
  const outsider = await createUser("outsider");
  const schema = await createSchema("Identity Notes");

  const created = await api("/api/vault/documents", {
    userId: owner.id,
    method: "POST",
    body: {
      title: "Preferred legal name",
      vaultSchemaId: schema.id,
      content: "Use my full legal name on official applications."
    }
  });
  const createdPayload = await created.json() as { document: { id: string } };

  const outsiderUpdate = await api(`/api/vault/documents/${createdPayload.document.id}`, {
    userId: outsider.id,
    method: "PUT",
    body: { title: "Changed by outsider" }
  });
  assert.equal(outsiderUpdate.status, 404);

  const ownerUpdate = await api(`/api/vault/documents/${createdPayload.document.id}`, {
    userId: owner.id,
    method: "PUT",
    body: {
      title: "Preferred application name",
      vaultSchemaId: null,
      content: "Use my full legal name only when a form requires it."
    }
  });
  assert.equal(ownerUpdate.status, 200);
  const updatedPayload = await ownerUpdate.json() as {
    document: { title: string; vaultSchema: null; frontmatter: { schema: null; content: string } };
  };
  assert.equal(updatedPayload.document.title, "Preferred application name");
  assert.equal(updatedPayload.document.vaultSchema, null);
  assert.equal(updatedPayload.document.frontmatter.schema, null);

  const deleted = await api(`/api/vault/documents/${createdPayload.document.id}`, {
    userId: owner.id,
    method: "DELETE"
  });
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { deleted: true });

  const remaining = await prisma.vaultDocument.findUnique({ where: { id: createdPayload.document.id } });
  assert.equal(remaining, null);
});

test("vault document search stays scoped to the signed-in user", async () => {
  const firstUser = await createUser("search-a");
  const secondUser = await createUser("search-b");

  await api("/api/vault/documents", {
    userId: firstUser.id,
    method: "POST",
    body: {
      title: "Ski trip packing",
      content: "Pack thermal gloves and blue ski jacket for the Alps."
    }
  });
  await api("/api/vault/documents", {
    userId: secondUser.id,
    method: "POST",
    body: {
      title: "Ski trip private note",
      content: "Pack a red passport wallet and second-user-only note."
    }
  });

  const response = await api("/api/vault/search?q=ski%20passport", { userId: firstUser.id });
  assert.equal(response.status, 200);
  const payload = await response.json() as { results: Array<{ title: string; excerpt: string }> };
  assert.ok(payload.results.some((result) => result.title === "Ski trip packing"));
  assert.equal(payload.results.some((result) => result.excerpt.includes("second-user-only")), false);
});
