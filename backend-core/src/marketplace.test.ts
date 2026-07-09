import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { AgentCategory, MarketplaceStatus } from "@prisma/client";

const { createApp } = await import("./app.js");
const { prisma } = await import("./db/prisma.js");
const { createVaultSalt } = await import("./services/cryptoService.js");
const { encodeJson } = await import("./services/jsonService.js");

const testRunId = `marketplace-${Date.now()}`;
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
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.agentVersion.deleteMany({ where: { agentDefinition: { slug: { startsWith: testRunId } } } });
  await prisma.agentDefinition.deleteMany({ where: { slug: { startsWith: testRunId } } });
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

async function createMarketplaceDefinition(input: {
  suffix: string;
  name: string;
  category?: AgentCategory;
  status?: MarketplaceStatus;
  isActive?: boolean;
  trustScore?: number;
  installCount?: number;
  manifest?: Record<string, unknown>;
}) {
  const definition = await prisma.agentDefinition.create({
    data: {
      slug: `${testRunId}-${input.suffix}`,
      name: `${testRunId} ${input.name}`,
      tagline: `${input.name} tagline`,
      description: `${input.name} description`,
      category: input.category ?? "Executive",
      status: input.status ?? "published",
      trustScore: input.trustScore ?? 70,
      installCount: input.installCount ?? 0,
      averageRating: 4.5
    }
  });
  await prisma.agentVersion.create({
    data: {
      agentDefinitionId: definition.id,
      version: "1.0.0",
      apiProtocol: "MCP",
      capabilityManifest: encodeJson({
        protocol: "MCP",
        tools: ["vault.search"],
        requestedSchemas: [],
        highRiskActions: [],
        description: `${input.name} manifest`,
        examplePrompts: [],
        trustReasons: [],
        ...input.manifest
      }),
      isActive: input.isActive ?? true
    }
  });
  return definition;
}

async function apiGet(path: string, userId?: string) {
  return fetch(`${baseUrl}${path}`, {
    headers: userId ? { "x-user-id": userId } : undefined
  });
}

async function apiPost(path: string, userId: string, body: unknown = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": userId },
    body: JSON.stringify(body)
  });
}

test("marketplace list returns only published helpers and supports category filtering", async () => {
  const user = await createUser("list-user");
  const custom = await createMarketplaceDefinition({ suffix: "published-custom", name: "Published Custom", category: "Custom" });
  await createMarketplaceDefinition({ suffix: "draft-custom", name: "Draft Custom", category: "Custom", status: "draft" });
  await createMarketplaceDefinition({ suffix: "published-finance", name: "Published Finance", category: "Financial" });

  const response = await apiGet("/api/marketplace/agents?category=Custom", user.id);
  assert.equal(response.status, 200);
  const data = await response.json() as { agents: Array<{ id: string; name: string; category: string }> };
  assert.deepEqual(data.agents.map((agent) => agent.id), [custom.id]);
  assert.equal(data.agents[0]?.category, "Custom");
});

test("marketplace search matches manifest fields and returns ranked results", async () => {
  const user = await createUser("search-user");
  const uniqueSearchNeedle = `${testRunId}-resume-needle`;
  const jobCoach = await createMarketplaceDefinition({
    suffix: "job-coach",
    name: "General Coach",
    trustScore: 82,
    installCount: 10,
    manifest: {
      requestedSchemas: [`${testRunId} Career Profile`],
      examplePrompts: [`Tailor my resume with ${uniqueSearchNeedle} for a job application`],
      trustReasons: ["Drafts but does not submit applications"]
    }
  });
  await createMarketplaceDefinition({
    suffix: "weak-application-match",
    name: "Application Archive",
    trustScore: 95,
    installCount: 3000,
    manifest: {
      examplePrompts: [`Organize old ${testRunId}-resume receipts`]
    }
  });
  await createMarketplaceDefinition({
    suffix: "unrelated-helper",
    name: "Garden Planner",
    manifest: {
      examplePrompts: ["Plan weekend home errands"]
    }
  });

  const response = await apiGet(`/api/marketplace/agents?search=${encodeURIComponent(uniqueSearchNeedle)}`, user.id);
  assert.equal(response.status, 200);
  const data = await response.json() as { agents: Array<{ id: string; matchScore?: number; matchReasons?: string[] }> };
  assert.equal(data.agents[0]?.id, jobCoach.id);
  assert.ok(data.agents.some((agent) => agent.id === jobCoach.id));
  assert.ok(data.agents.every((agent) => typeof agent.matchScore === "number"));
  assert.ok((data.agents[0]?.matchReasons?.length ?? 0) > 0);
});

test("marketplace install creates one install, resolves name conflicts, and increments count once", async () => {
  const user = await createUser("install-user");
  const definition = await createMarketplaceDefinition({
    suffix: "installable",
    name: "Installable Helper",
    installCount: 4
  });
  await prisma.agent.create({
    data: {
      name: `${testRunId} Installable Helper`,
      category: "Executive",
      apiProtocol: "MCP",
      trustScore: 60,
      capabilityManifest: encodeJson({ protocol: "MCP", tools: [] }),
      connections: {
        create: {
          userId: user.id,
          connectionStatus: "active",
          tokenExpiresAt: new Date(Date.now() + 60_000)
        }
      }
    }
  });

  const firstResponse = await apiPost(`/api/marketplace/agents/${definition.id}/install`, user.id, {});
  assert.equal(firstResponse.status, 201);
  const firstData = await firstResponse.json() as { install: { displayName: string; agent?: { id: string } } };
  assert.equal(firstData.install.displayName, `${testRunId} Installable Helper 2`);
  assert.ok(firstData.install.agent?.id);

  const afterFirstInstall = await prisma.agentDefinition.findUniqueOrThrow({ where: { id: definition.id } });
  assert.equal(afterFirstInstall.installCount, 5);

  const secondResponse = await apiPost(`/api/marketplace/agents/${definition.id}/install`, user.id, {});
  assert.equal(secondResponse.status, 200);
  const secondData = await secondResponse.json() as { install: { displayName: string; agent?: { id: string } } };
  assert.equal(secondData.install.displayName, firstData.install.displayName);
  assert.equal(secondData.install.agent?.id, firstData.install.agent?.id);

  const afterSecondInstall = await prisma.agentDefinition.findUniqueOrThrow({ where: { id: definition.id } });
  assert.equal(afterSecondInstall.installCount, 5);
});

test("marketplace install blocks unavailable helpers and helpers without an active version", async () => {
  const user = await createUser("blocked-install-user");
  const draft = await createMarketplaceDefinition({ suffix: "draft-blocked", name: "Draft Blocked", status: "draft" });
  const noActiveVersion = await createMarketplaceDefinition({
    suffix: "no-active-version",
    name: "No Active Version",
    isActive: false
  });

  const draftResponse = await apiPost(`/api/marketplace/agents/${draft.id}/install`, user.id, {});
  assert.equal(draftResponse.status, 404);
  const draftData = await draftResponse.json() as { error: { message: string } };
  assert.match(draftData.error.message, /not available/i);

  const inactiveResponse = await apiPost(`/api/marketplace/agents/${noActiveVersion.id}/install`, user.id, {});
  assert.equal(inactiveResponse.status, 409);
  const inactiveData = await inactiveResponse.json() as { error: { message: string } };
  assert.match(inactiveData.error.message, /active version/i);
});
