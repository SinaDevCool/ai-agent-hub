import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "test-anon-key";

const { createApp } = await import("./app.js");
const { prisma } = await import("./db/prisma.js");
const { createVaultSalt, sha256 } = await import("./services/cryptoService.js");
const { encodeJson } = await import("./services/jsonService.js");
const { embedText } = await import("./services/embeddingService.js");
const { createHitlRequest, decideHitlRequest } = await import("./services/hitlService.js");
const { runAgentForUser } = await import("./services/agentRuntimeService.js");

const testRunId = `safety-${Date.now()}`;
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
  await prisma.agentPermission.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userAgentInstall.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.hitlRequest.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.vaultDocument.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

async function createUser(id: string) {
  return prisma.user.create({
    data: {
      id,
      email: `${id}@example.test`,
      vaultLocalPath: "test-vault",
      vaultEncryptionSalt: createVaultSalt()
    }
  });
}

async function createConnectedAgent(input: { userId: string; name: string; requestedSchemas?: string[]; highRiskActions?: string[] }) {
  const agent = await prisma.agent.create({
    data: {
      name: input.name,
      category: "Financial",
      apiProtocol: "MCP",
      trustScore: 75,
      capabilityManifest: encodeJson({
        protocol: "MCP",
        tools: ["vault.search", "action.execute"],
        requestedSchemas: input.requestedSchemas ?? [],
        highRiskActions: input.highRiskActions ?? [],
        description: "Safety integration test helper."
      })
    }
  });
  await prisma.userConnection.create({
    data: {
      userId: input.userId,
      agentId: agent.id,
      connectionStatus: "active",
      tokenExpiresAt: new Date(Date.now() + 60_000)
    }
  });
  return agent;
}

test("authenticated API routes reject requests without a bearer token", async () => {
  const response = await fetch(`${baseUrl}/api/agents`);
  assert.equal(response.status, 401);
});

test("helpers with the same display name can exist for different users", async () => {
  const firstUser = await createUser(`${testRunId}-owner-a`);
  const secondUser = await createUser(`${testRunId}-owner-b`);
  const sharedName = `${testRunId}-Travel Helper`;

  const firstAgent = await createConnectedAgent({ userId: firstUser.id, name: sharedName });
  const secondAgent = await createConnectedAgent({ userId: secondUser.id, name: sharedName });

  assert.notEqual(firstAgent.id, secondAgent.id);
  assert.equal(firstAgent.name, secondAgent.name);
});

test("agent runtime cannot read private info before a matching permission is granted", async () => {
  const user = await createUser(`${testRunId}-permission-user`);
  const schema = await prisma.vaultSchema.upsert({
    where: { name: `${testRunId}-Financial Preferences` },
    update: {},
    create: {
      name: `${testRunId}-Financial Preferences`,
      description: "Test financial notes.",
      structuralTemplate: encodeJson({ fields: ["approvalThreshold"] })
    }
  });
  const agent = await createConnectedAgent({
    userId: user.id,
    name: `${testRunId}-Permission Helper`,
    requestedSchemas: [schema.name]
  });
  const textForEmbedding = "Approval threshold is 250 dollars.";
  const embedding = await embedText(textForEmbedding);
  await prisma.vaultDocument.create({
    data: {
      userId: user.id,
      vaultSchemaId: schema.id,
      title: `${testRunId} approval rule`,
      relativePath: `${testRunId}/approval-rule.md`,
      contentHash: sha256(textForEmbedding),
      frontmatter: encodeJson({ content: textForEmbedding }),
      excerpt: textForEmbedding,
      vectorProvider: embedding.provider,
      embedding: encodeJson(embedding.vector)
    }
  });

  const blocked = await runAgentForUser({ userId: user.id, agentId: agent.id, message: "What approval threshold do I use?" });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.runtimeState, "needs_permission");

  await prisma.agentPermission.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      vaultSchemaId: schema.id,
      permissionType: "read",
      restrictionRules: encodeJson({ deniedPaths: [], maxRecords: 8 }),
      expiresAt: new Date(Date.now() + 60_000)
    }
  });

  const allowed = await runAgentForUser({ userId: user.id, agentId: agent.id, message: "What approval threshold do I use?" });
  assert.equal(allowed.status, "ok");
  assert.ok((allowed.documents?.length ?? 0) > 0);
});

test("expired approvals cannot be decided and approved actions cannot be continued twice", async () => {
  const user = await createUser(`${testRunId}-hitl-user`);
  const agent = await createConnectedAgent({
    userId: user.id,
    name: `${testRunId}-Approval Helper`,
    highRiskActions: ["transfer_funds"]
  });

  const expired = await createHitlRequest({
    userId: user.id,
    agentId: agent.id,
    actionName: "transfer_funds",
    payload: { amount: 10 },
    ttlMinutes: -1
  });
  await assert.rejects(
    () => decideHitlRequest(expired.id, user.id, true),
    /no longer pending or has expired/
  );

  const pending = await createHitlRequest({
    userId: user.id,
    agentId: agent.id,
    actionName: "transfer_funds",
    payload: { amount: 10 },
    ttlMinutes: 15
  });
  await decideHitlRequest(pending.id, user.id, true);

  const firstContinuation = await runAgentForUser({
    userId: user.id,
    agentId: agent.id,
    message: "continue approved action: transfer funds"
  });
  assert.equal(firstContinuation.status, "ok");

  const secondContinuation = await runAgentForUser({
    userId: user.id,
    agentId: agent.id,
    message: "continue approved action: transfer funds"
  });
  assert.equal(secondContinuation.status, "blocked");
});
