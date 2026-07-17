import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { prisma } from "./db/prisma.js";
import { createVaultSalt } from "./services/cryptoService.js";
import { encodeJson } from "./services/jsonService.js";
import { getConnectorCapability, listConnectorCapabilities } from "./services/connectorCapabilityService.js";
import { executeConnector } from "./services/connectorExecutionService.js";
import {
  registerConnectorProvider,
  resolveConnectorProvider,
  unregisterConnectorProvider
} from "./services/connectorProviderRegistryService.js";
import { createWorkflowConnection } from "./services/workflowConnectionService.js";
import { resetWebhookFetchForTest, setWebhookFetchForTest } from "./services/tools/adapters/webhookAdapter.js";
import { toolRegistry, type ToolDefinition } from "./services/toolRegistryService.js";

const testRunId = `connector-execution-${Date.now()}`;
const testToolNames: string[] = [];
const testProviderIds: string[] = [];

function addTool(definition: ToolDefinition) {
  toolRegistry.push(definition);
  testToolNames.push(definition.name);
}

async function createUserAndAgent(suffix: string) {
  const user = await prisma.user.create({
    data: {
      id: `${testRunId}-${suffix}`,
      email: `${testRunId}-${suffix}@example.test`,
      vaultLocalPath: "test-vault",
      vaultEncryptionSalt: createVaultSalt()
    }
  });
  const agent = await prisma.agent.create({
    data: {
      name: `${testRunId}-${suffix}-agent`,
      category: "Custom",
      apiProtocol: "MCP",
      trustScore: 82,
      capabilityManifest: encodeJson({
        protocol: "MCP",
        tools: ["workflow.run"],
        requestedSchemas: [],
        highRiskActions: [],
        description: "Connector execution test agent."
      })
    }
  });
  await prisma.userConnection.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      connectionStatus: "active",
      tokenExpiresAt: new Date(Date.now() + 60_000)
    }
  });
  return { user, agent };
}

async function createActiveWorkflow(input: {
  userId: string;
  agentId: string;
  capabilityKey: string;
  name?: string;
}) {
  const created = await createWorkflowConnection({
    userId: input.userId,
    agentId: input.agentId,
    name: input.name ?? "Connector workflow",
    provider: "n8n",
    endpointUrl: "https://workflow.example.test/connector",
    capabilityKey: input.capabilityKey
  });
  await prisma.workflowConnection.update({
    where: { id: created.workflow.id },
    data: { status: "active" }
  });
  return created.workflow;
}

before(() => {
  const highRiskToolName = `${testRunId}.book-hotel`;
  const providerId = `${testRunId}-booking-provider`;
  addTool({
    name: highRiskToolName,
    description: "Book a hotel through a test provider.",
    category: "travel",
    riskLevel: "high",
    requiresApproval: true,
    adapterType: "webhook",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  });
  registerConnectorProvider({
    providerId,
    label: "Test booking provider",
    kind: "workflow",
    toolName: highRiskToolName,
    capabilities: ["travel.search_hotels"],
    actions: ["execute_action"],
    requiresConnectedAccount: false,
    description: "Test provider for approval handoff."
  });
  testProviderIds.push(providerId);
});

afterEach(() => {
  resetWebhookFetchForTest();
});

after(async () => {
  for (const providerId of testProviderIds) unregisterConnectorProvider(providerId);
  for (const name of testToolNames) {
    const index = toolRegistry.findIndex((tool) => tool.name === name);
    if (index >= 0) toolRegistry.splice(index, 1);
  }
  await prisma.hitlRequest.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.toolRun.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.workflowConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

test("connector capability aliases resolve to canonical provider capabilities", () => {
  const hotelAlias = getConnectorCapability("travel.hotel.search");
  assert.equal(hotelAlias?.canonicalKey, "travel.search_hotels");
  assert.equal(hotelAlias?.label, "Find hotels");

  const capabilities = listConnectorCapabilities();
  assert.ok(capabilities.some((capability) =>
    capability.key === "travel.search_hotels" && capability.aliases.includes("travel.hotel.search")
  ));

  const provider = resolveConnectorProvider({ capabilityKey: "travel.hotel.search" });
  assert.equal(provider?.providerId, "workflow");
  assert.equal(provider?.toolName, "workflow.run");
});

test("executeConnector runs a capability through the active workflow provider and normalizes B2C output", async () => {
  const { user, agent } = await createUserAndAgent("workflow");
  const workflow = await createActiveWorkflow({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    name: "Hotel finder"
  });

  setWebhookFetchForTest(async (_url, init) => {
    const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    assert.equal(payload.capabilityKey, "travel.search_hotels");
    assert.equal(payload.toolName, "workflow.run");
    assert.equal((payload.input as Record<string, unknown>).connectorProviderId, "workflow");
    return new Response(JSON.stringify({
      summary: "I found two hotels near the center.",
      hotels: [
        { name: "Central Stay", location: "Old Town", price: "$140/night", bookingUrl: "https://example.test/stay" },
        { name: "Station Rooms", location: "Near transit", price: "$118/night" }
      ],
      requestId: "provider-request-1"
    }), { status: 200 });
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.hotel.search",
    input: {
      message: "Find hotels in Lisbon",
      destination: "Lisbon",
      checkInDate: "2026-08-12",
      checkOutDate: "2026-08-16",
      guests: 2
    }
  });

  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.providerId, "workflow");
    assert.equal(result.result.title, "Hotel options found");
    assert.equal(result.result.summary, "I found two hotels near the center.");
    assert.equal(result.result.items[0]?.title, "Central Stay");
    assert.equal(result.result.items[0]?.price, "$140/night");
    assert.equal(result.result.receipt.providerLabel, "Connected workflow");
    assert.equal(result.result.receipt.capabilityKey, "travel.search_hotels");
    assert.equal(result.result.receipt.externalRequestId, "provider-request-1");
    assert.equal(result.rawResult?.workflowConnectionId, workflow.id);
  }
});

test("executeConnector returns a client-safe blocked result when no workflow is connected", async () => {
  const { user, agent } = await createUserAndAgent("missing-workflow");
  setWebhookFetchForTest(async () => {
    throw new Error("No workflow should be fetched.");
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.flight.search",
    input: {
      message: "Find flights to Lisbon",
      origin: "Berlin",
      destination: "Lisbon",
      departureDate: "2026-08-12",
      passengers: 1
    }
  });

  assert.equal(result.status, "blocked");
  if (result.status === "blocked") {
    assert.equal(result.code, "provider_error");
    assert.equal(result.nextAction, "fix_workflow");
    assert.match(result.reason, /Find flights/);
    assert.ok(result.toolRunId);
  }
});

test("executeConnector sends high-risk provider actions through the approval gate", async () => {
  const { user, agent } = await createUserAndAgent("approval");
  const providerId = `${testRunId}-booking-provider`;
  setWebhookFetchForTest(async () => {
    throw new Error("High-risk provider action should pause before calling the provider.");
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.hotel.search",
    action: "execute_action",
    preferredProviderId: providerId,
    input: {
      selectedOptionId: "hotel-123",
      maxApprovedTotal: 420,
      cancellationRuleAcknowledged: true
    }
  });

  assert.equal(result.status, "awaiting_human_approval");
  if (result.status === "awaiting_human_approval") {
    const request = await prisma.hitlRequest.findUniqueOrThrow({ where: { id: result.requestId } });
    assert.match(request.payload, /selectedOptionId/);
    assert.match(request.payload, /maxApprovedTotal/);
    assert.match(request.payload, /connectorProviderId/);
  }
});

test("canonical hotel contract blocks incomplete search before provider execution", async () => {
  const { user, agent } = await createUserAndAgent("missing-hotel-fields");
  setWebhookFetchForTest(async () => {
    throw new Error("Incomplete provider input should not call the workflow.");
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    input: { destination: "Lisbon" }
  });

  assert.equal(result.status, "blocked");
  if (result.status === "blocked") {
    assert.equal(result.code, "invalid_input");
    assert.equal(result.nextAction, "add_missing_info");
    assert.match(result.userMessage ?? "", /destination, dates, and number of guests/i);
  }
  const receipt = await prisma.providerReceipt.findFirstOrThrow({
    where: { userId: user.id, capabilityKey: "travel.search_hotels" },
    orderBy: { createdAt: "desc" }
  });
  assert.equal(receipt.status, "blocked");
  assert.match(receipt.metadata, /checkInDate/);
});

test("canonical finance contract blocks without account and date range", async () => {
  const { user, agent } = await createUserAndAgent("missing-finance-fields");
  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "finance.review_spending",
    input: { goal: "find subscription waste" }
  });

  assert.equal(result.status, "blocked");
  if (result.status === "blocked") {
    assert.equal(result.code, "invalid_input");
    assert.match(result.userMessage ?? "", /account or source and date range/i);
  }
});

test("canonical health contract requires allowed private info before execution", async () => {
  const { user, agent } = await createUserAndAgent("missing-health-fields");
  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "health.organize_notes",
    input: { task: "summarize for appointment" }
  });

  assert.equal(result.status, "blocked");
  if (result.status === "blocked") {
    assert.equal(result.code, "invalid_input");
    assert.match(result.userMessage ?? "", /Allow the health info/i);
  }
});
