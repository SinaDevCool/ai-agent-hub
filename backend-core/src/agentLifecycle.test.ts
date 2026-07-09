import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const { createApp } = await import("./app.js");
const { prisma } = await import("./db/prisma.js");
const { createVaultSalt } = await import("./services/cryptoService.js");
const { encodeJson } = await import("./services/jsonService.js");

const testRunId = `lifecycle-${Date.now()}`;
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
  await prisma.hitlRequest.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userAgentInstall.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.agentVersion.deleteMany({ where: { agentDefinition: { slug: { startsWith: testRunId } } } });
  await prisma.agentDefinition.deleteMany({ where: { slug: { startsWith: testRunId } } });
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

async function createConnectedAgent(userId: string, suffix: string) {
  return prisma.agent.create({
    data: {
      name: `${testRunId} ${suffix}`,
      category: "Executive",
      apiProtocol: "MCP",
      trustScore: 72,
      capabilityManifest: encodeJson({ protocol: "MCP", tools: ["vault.search"] }),
      connections: {
        create: {
          userId,
          connectionStatus: "active",
          tokenExpiresAt: new Date(Date.now() + 60_000)
        }
      }
    }
  });
}

async function createMarketplaceInstall(userId: string, agentId: string, suffix: string) {
  const definition = await prisma.agentDefinition.create({
    data: {
      slug: `${testRunId}-${suffix}`,
      name: `${testRunId} ${suffix}`,
      tagline: "Lifecycle test helper",
      description: "Lifecycle test marketplace definition.",
      category: "Executive",
      status: "published",
      trustScore: 70,
      installCount: 1,
      averageRating: 4.4
    }
  });
  const version = await prisma.agentVersion.create({
    data: {
      agentDefinitionId: definition.id,
      version: "1.0.0",
      apiProtocol: "MCP",
      capabilityManifest: encodeJson({ protocol: "MCP", tools: ["vault.search"] }),
      isActive: true
    }
  });
  await prisma.userAgentInstall.create({
    data: {
      userId,
      agentDefinitionId: definition.id,
      agentVersionId: version.id,
      agentId,
      displayName: `${testRunId} ${suffix}`,
      connectionStatus: "active"
    }
  });
  return definition;
}

async function apiDelete(path: string, userId: string) {
  return fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: { "x-user-id": userId }
  });
}

test("removing a user-owned helper deletes user-scoped runtime data and the orphan agent row", async () => {
  const user = await createUser("remove-owner");
  const agent = await createConnectedAgent(user.id, "Owned Helper");
  const schema = await prisma.vaultSchema.create({
    data: {
      name: `${testRunId} Removal Schema`,
      description: "Lifecycle removal schema.",
      structuralTemplate: encodeJson({ fields: ["note"] })
    }
  });
  await prisma.agentPermission.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      vaultSchemaId: schema.id,
      permissionType: "read",
      restrictionRules: encodeJson({ maxRecords: 3 }),
      expiresAt: new Date(Date.now() + 60_000)
    }
  });
  await prisma.hitlRequest.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      actionName: "send_email",
      payload: encodeJson({ to: "person@example.test" }),
      status: "pending_human_approval",
      expiresAt: new Date(Date.now() + 60_000)
    }
  });
  const conversation = await prisma.agentConversation.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      title: "Removal conversation",
      messages: {
        create: {
          role: "user",
          content: "hello",
          metadata: encodeJson({})
        }
      }
    }
  });
  const definition = await createMarketplaceInstall(user.id, agent.id, "owned-marketplace-install");

  const response = await apiDelete(`/api/agents/${agent.id}`, user.id);
  assert.equal(response.status, 200);
  const data = await response.json() as { status: string; deletedAgent: boolean };
  assert.equal(data.status, "removed");
  assert.equal(data.deletedAgent, true);

  assert.equal(await prisma.agent.findUnique({ where: { id: agent.id } }), null);
  assert.equal(await prisma.userConnection.count({ where: { userId: user.id, agentId: agent.id } }), 0);
  assert.equal(await prisma.agentPermission.count({ where: { userId: user.id, agentId: agent.id } }), 0);
  assert.equal(await prisma.hitlRequest.count({ where: { userId: user.id, agentId: agent.id } }), 0);
  assert.equal(await prisma.agentConversation.count({ where: { id: conversation.id } }), 0);
  assert.equal(await prisma.userAgentInstall.count({ where: { userId: user.id, agentId: agent.id } }), 0);
  assert.ok(await prisma.agentDefinition.findUnique({ where: { id: definition.id } }));

  const removalLog = await prisma.activityLog.findFirstOrThrow({
    where: { userId: user.id, actionType: "agent_removed" },
    orderBy: { createdAt: "desc" }
  });
  assert.equal(removalLog.agentId, null);
  assert.equal(removalLog.dataAccessed, agent.name);
  const metadata = JSON.parse(removalLog.dynamicMetadata) as { removedAgentId?: string; deletedAgent?: boolean };
  assert.equal(metadata.removedAgentId, agent.id);
  assert.equal(metadata.deletedAgent, true);
});

test("removing a shared helper disconnects only that user and keeps the shared agent row", async () => {
  const firstUser = await createUser("shared-owner-a");
  const secondUser = await createUser("shared-owner-b");
  const agent = await createConnectedAgent(firstUser.id, "Shared Helper");
  await prisma.userConnection.create({
    data: {
      userId: secondUser.id,
      agentId: agent.id,
      connectionStatus: "active",
      tokenExpiresAt: new Date(Date.now() + 60_000)
    }
  });
  const firstConversation = await prisma.agentConversation.create({
    data: { userId: firstUser.id, agentId: agent.id, title: "First user chat" }
  });
  const secondConversation = await prisma.agentConversation.create({
    data: { userId: secondUser.id, agentId: agent.id, title: "Second user chat" }
  });

  const response = await apiDelete(`/api/agents/${agent.id}`, firstUser.id);
  assert.equal(response.status, 200);
  const data = await response.json() as { deletedAgent: boolean };
  assert.equal(data.deletedAgent, false);

  assert.ok(await prisma.agent.findUnique({ where: { id: agent.id } }));
  assert.equal(await prisma.userConnection.count({ where: { userId: firstUser.id, agentId: agent.id } }), 0);
  assert.equal(await prisma.userConnection.count({ where: { userId: secondUser.id, agentId: agent.id } }), 1);
  assert.equal(await prisma.agentConversation.count({ where: { id: firstConversation.id } }), 0);
  assert.equal(await prisma.agentConversation.count({ where: { id: secondConversation.id } }), 1);

  const removalLog = await prisma.activityLog.findFirstOrThrow({
    where: { userId: firstUser.id, actionType: "agent_removed" },
    orderBy: { createdAt: "desc" }
  });
  assert.equal(removalLog.agentId, agent.id);
});

test("removing an unowned helper returns 404", async () => {
  const owner = await createUser("actual-owner");
  const outsider = await createUser("outsider");
  const agent = await createConnectedAgent(owner.id, "Private Helper");

  const response = await apiDelete(`/api/agents/${agent.id}`, outsider.id);
  assert.equal(response.status, 404);
  assert.ok(await prisma.agent.findUnique({ where: { id: agent.id } }));
  assert.equal(await prisma.userConnection.count({ where: { userId: owner.id, agentId: agent.id } }), 1);
});
