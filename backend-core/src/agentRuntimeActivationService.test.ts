import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { prisma } from "./db/prisma.js";
import { createVaultSalt } from "./services/cryptoService.js";
import { encodeJson } from "./services/jsonService.js";
import { buildAgentImportManifest } from "./services/agentImportManifestService.js";
import {
  activateAgentRuntime,
  getAgentRuntimeSetup,
  resetRuntimeActivationFetchForTest,
  setRuntimeActivationFetchForTest,
  testAgentRuntimeSetup
} from "./services/agentRuntimeActivationService.js";
import { runAgentForUser } from "./services/agentRuntimeService.js";

const testRunId = `runtime-activation-${Date.now()}`;

afterEach(() => {
  resetRuntimeActivationFetchForTest();
});

after(async () => {
  await prisma.agentMessage.deleteMany({ where: { conversation: { userId: { startsWith: testRunId } } } });
  await prisma.agentConversation.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.providerDefinition.deleteMany({ where: { createdByUserId: { startsWith: testRunId } } });
  await prisma.workflowConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
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

async function createInstalledImportedAgent(input: {
  suffix: string;
  sourceType: "mcp" | "openapi" | "workflow" | "hosted_agent";
  endpointUrl?: string;
  workflowId?: string;
}) {
  const user = await createUser(input.suffix);
  const manifest = buildAgentImportManifest({
    sourceType: input.sourceType,
    name: `${testRunId}-${input.suffix}-agent`,
    description: "Imported runtime activation test agent.",
    category: "Travel",
    endpointUrl: input.endpointUrl,
    workflowId: input.workflowId,
    capabilityKeys: ["travel.search_hotels"]
  });
  const legacySourceType = input.sourceType === "mcp" ? "mcp_server" : input.sourceType === "openapi" ? "openapi_endpoint" : "native";
  const agent = await prisma.agent.create({
    data: {
      name: `${testRunId}-${input.suffix}-agent`,
      category: "Travel",
      apiProtocol: input.sourceType === "openapi" ? "OpenAPI" : "MCP",
      trustScore: 70,
      capabilityManifest: encodeJson({
        protocol: input.sourceType === "openapi" ? "OpenAPI" : "MCP",
        sourceType: legacySourceType,
        externalEndpointUrl: input.endpointUrl,
        verificationStatus: "verified",
        tools: input.sourceType === "workflow" ? ["workflow.run"] : ["vault.search"],
        requestedSchemas: [],
        highRiskActions: [],
        description: manifest.identity.description,
        normalizedImportManifest: manifest
      })
    }
  });
  await prisma.userConnection.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      connectionStatus: "restricted",
      tokenExpiresAt: new Date(Date.now() + 60_000)
    }
  });
  return { user, agent };
}

test("imported MCP agent is setup-required until activated", async () => {
  const { user, agent } = await createInstalledImportedAgent({
    suffix: "mcp-setup-required",
    sourceType: "mcp",
    endpointUrl: "https://runtime.example.test/mcp"
  });

  const setup = await getAgentRuntimeSetup({ userId: user.id, agentId: agent.id });
  assert.equal(setup.status, "setup_required");
  assert.equal(setup.executable, false);

  const run = await runAgentForUser({
    userId: user.id,
    agentId: agent.id,
    message: "Find hotels in Berlin"
  });
  assert.equal(run.status, "blocked");
  assert.match(run.reply, /needs setup/i);
});

test("MCP activation discovers tools and persists an active provider binding", async () => {
  const { user, agent } = await createInstalledImportedAgent({
    suffix: "mcp-active",
    sourceType: "mcp",
    endpointUrl: "https://runtime.example.test/mcp"
  });
  setRuntimeActivationFetchForTest(async (_url, init) => {
    const payload = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    assert.equal(payload.method, "tools/list");
    return new Response(JSON.stringify({
      result: {
        tools: [
          { name: "searchHotels", description: "Find hotels by destination, dates, and guests." },
          { name: "bookHotel", description: "Reserve a room after approval." }
        ]
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  });

  const activated = await activateAgentRuntime({ userId: user.id, agentId: agent.id });
  assert.equal(activated.status, "active");
  assert.equal(activated.executable, true);
  assert.ok(activated.providerDefinitionId);
  assert.ok(activated.discoveredTools.includes("searchHotels"));
  assert.ok(activated.discoveredCapabilities.includes("travel.search_hotels"));

  const saved = await getAgentRuntimeSetup({ userId: user.id, agentId: agent.id });
  assert.equal(saved.status, "active");
  assert.equal(saved.providerDefinitionId, activated.providerDefinitionId);
});

test("OpenAPI activation parses operations and registers provider definition", async () => {
  const { user, agent } = await createInstalledImportedAgent({
    suffix: "openapi-active",
    sourceType: "openapi",
    endpointUrl: "https://runtime.example.test/openapi.json"
  });
  setRuntimeActivationFetchForTest(async () => new Response(JSON.stringify({
    openapi: "3.1.0",
    paths: {
      "/hotels/search": {
        get: {
          operationId: "searchHotels",
          summary: "Search hotels by destination and date"
        }
      },
      "/flights/search": {
        get: {
          operationId: "searchFlights",
          summary: "Search flights by origin and destination"
        }
      }
    }
  }), { status: 200, headers: { "content-type": "application/json" } }));

  const activated = await activateAgentRuntime({ userId: user.id, agentId: agent.id });
  assert.equal(activated.status, "active");
  assert.equal(activated.executable, true);
  assert.ok(activated.discoveredCapabilities.includes("travel.search_hotels"));
  assert.ok(activated.discoveredCapabilities.includes("travel.search_flights"));
  assert.ok(activated.discoveredTools.includes("searchHotels"));

  const provider = await prisma.providerDefinition.findUnique({ where: { providerId: activated.providerId } });
  assert.equal(provider?.status, "active");
  assert.equal(provider?.kind, "openapi");
});

test("blocked import remains non-activatable", async () => {
  const { user, agent } = await createInstalledImportedAgent({
    suffix: "blocked",
    sourceType: "hosted_agent"
  });

  const activated = await activateAgentRuntime({ userId: user.id, agentId: agent.id });
  assert.equal(activated.status, "blocked");
  assert.equal(activated.executable, false);

  const testResult = await testAgentRuntimeSetup({ userId: user.id, agentId: agent.id });
  assert.equal(testResult.ok, false);
});

test("workflow activation succeeds only with an active user workflow", async () => {
  const { user, agent } = await createInstalledImportedAgent({
    suffix: "workflow",
    sourceType: "workflow"
  });

  const before = await activateAgentRuntime({ userId: user.id, agentId: agent.id });
  assert.equal(before.status, "setup_required");

  const workflow = await prisma.workflowConnection.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      toolName: "workflow.run",
      capabilityKey: "travel.search_hotels",
      name: "Active hotel workflow",
      provider: "n8n",
      endpointUrl: "https://workflow.example.test/hotels",
      encryptedSecret: "encrypted-test-secret",
      status: "active"
    }
  });

  const activated = await activateAgentRuntime({ userId: user.id, agentId: agent.id, workflowId: workflow.id });
  assert.equal(activated.status, "active");
  assert.equal(activated.executable, true);
  assert.equal(activated.workflowId, workflow.id);
  assert.deepEqual(activated.discoveredCapabilities, ["travel.search_hotels"]);
});
