import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { prisma } from "./db/prisma.js";
import { createVaultSalt } from "./services/cryptoService.js";
import { encodeJson } from "./services/jsonService.js";
import { executeConnector } from "./services/connectorExecutionService.js";
import {
  registerConnectorProvider,
  unregisterConnectorProvider
} from "./services/connectorProviderRegistryService.js";
import { getProviderHealthForUser, getProviderReadinessSummary } from "./services/providerHealthService.js";
import { createWorkflowConnection } from "./services/workflowConnectionService.js";
import { resetWebhookFetchForTest, setWebhookFetchForTest } from "./services/tools/adapters/webhookAdapter.js";
import { toolRegistry, type ToolDefinition } from "./services/toolRegistryService.js";

const testRunId = `provider-health-${Date.now()}`;
const retryToolName = `${testRunId}.retry-search`;
const actionToolName = `${testRunId}.action`;
const retryProviderId = `${testRunId}-retry-provider`;
const actionProviderId = `${testRunId}-action-provider`;
const credentialProviderId = `${testRunId}-credential-provider`;
const testToolNames: string[] = [];
const testProviderIds: string[] = [];
let server: Server;
let baseUrl = "";

const hotelInput = {
  message: "Find hotels",
  destination: "Porto",
  checkInDate: "2026-08-12",
  checkOutDate: "2026-08-16",
  guests: 2
};

const bookingInput = {
  selectedOptionId: "hotel-1",
  maxApprovedTotal: 300,
  cancellationRuleAcknowledged: true
};

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
      trustScore: 84,
      capabilityManifest: encodeJson({
        protocol: "MCP",
        tools: ["workflow.run"],
        requestedSchemas: [],
        highRiskActions: [],
        description: "Provider health test agent."
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

async function createWorkflow(input: {
  userId: string;
  agentId: string;
  capabilityKey: string;
  status?: "active" | "disabled";
}) {
  const created = await createWorkflowConnection({
    userId: input.userId,
    agentId: input.agentId,
    name: "Health workflow",
    provider: "n8n",
    endpointUrl: "https://workflow.example.test/health",
    capabilityKey: input.capabilityKey
  });
  await prisma.workflowConnection.update({
    where: { id: created.workflow.id },
    data: { status: input.status ?? "active" }
  });
  return created.workflow;
}

async function apiGet(path: string, userId: string) {
  return fetch(`${baseUrl}${path}`, { headers: { "x-user-id": userId } });
}

before(() => {
  server = createApp().listen(0);
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  addTool({
    name: retryToolName,
    description: "Retryable search provider.",
    category: "travel",
    riskLevel: "low",
    requiresApproval: false,
    adapterType: "webhook",
    adapterConfig: { endpointUrl: "https://provider.example.test/search", timeoutMs: 1000, maxResponseBytes: 4096 },
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  });
  registerConnectorProvider({
    providerId: retryProviderId,
    label: "Retry provider",
    kind: "workflow",
    toolName: retryToolName,
    capabilities: ["travel.search_hotels"],
    actions: ["search"],
    requiresConnectedAccount: false,
    description: "Test provider with retry behavior."
  });
  testProviderIds.push(retryProviderId);

  addTool({
    name: actionToolName,
    description: "Non-retried action provider.",
    category: "travel",
    riskLevel: "medium",
    requiresApproval: false,
    adapterType: "webhook",
    adapterConfig: { endpointUrl: "https://provider.example.test/action", timeoutMs: 1000, maxResponseBytes: 4096 },
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  });
  registerConnectorProvider({
    providerId: actionProviderId,
    label: "Action provider",
    kind: "workflow",
    toolName: actionToolName,
    capabilities: ["travel.search_hotels"],
    actions: ["execute_action"],
    requiresConnectedAccount: false,
    description: "Test provider for action retry policy."
  });
  testProviderIds.push(actionProviderId);

  registerConnectorProvider({
    providerId: credentialProviderId,
    label: "Credential provider",
    kind: "api",
    toolName: retryToolName,
    capabilities: ["travel.search_hotels"],
    actions: ["search"],
    requiresConnectedAccount: true,
    credentialType: "api_key",
    credentialFields: [{ key: "apiKey", label: "API key", type: "password", required: true }],
    authType: "api_key",
    description: "Test provider requiring a connected account."
  });
  testProviderIds.push(credentialProviderId);
});

afterEach(() => {
  resetWebhookFetchForTest();
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  for (const providerId of testProviderIds) unregisterConnectorProvider(providerId);
  for (const name of testToolNames) {
    const index = toolRegistry.findIndex((tool) => tool.name === name);
    if (index >= 0) toolRegistry.splice(index, 1);
  }
  await prisma.providerReceipt.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.toolRun.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.workflowConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

test("provider search retries once on a transient provider failure and records both attempts", async () => {
  const { user, agent } = await createUserAndAgent("retry-success");
  let calls = 0;
  setWebhookFetchForTest(async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ message: "temporary outage" }), { status: 502 });
    }
    return new Response(JSON.stringify({ reply: "Search recovered.", requestId: "recovered-1" }), { status: 200 });
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: retryProviderId,
    input: hotelInput,
    idempotencyKey: `${testRunId}-retry-success`
  });

  assert.equal(result.status, "ok");
  assert.equal(calls, 2);
  const receipts = await prisma.providerReceipt.findMany({
    where: { userId: user.id, providerId: retryProviderId },
    orderBy: { createdAt: "asc" }
  });
  assert.equal(receipts.length, 2);
  assert.equal(receipts[0]?.status, "blocked");
  assert.equal(receipts[1]?.status, "succeeded");

  const health = await getProviderHealthForUser({ userId: user.id, capabilityKey: "travel.search_hotels", providerId: retryProviderId });
  assert.equal(health[0]?.state, "healthy");
});

test("provider action execution is not retried automatically", async () => {
  const { user, agent } = await createUserAndAgent("action-no-retry");
  let calls = 0;
  setWebhookFetchForTest(async () => {
    calls += 1;
    return new Response(JSON.stringify({ message: "action provider down" }), { status: 502 });
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    action: "execute_action",
    preferredProviderId: actionProviderId,
    input: bookingInput,
    approvalOverride: { hitlRequestId: `${testRunId}-approved-action` }
  });

  assert.equal(result.status, "blocked");
  assert.equal(calls, 1);
  assert.equal(await prisma.providerReceipt.count({ where: { userId: user.id, providerId: actionProviderId } }), 1);
});

test("repeated provider failures move provider health to failing", async () => {
  const { user, agent } = await createUserAndAgent("failing");
  setWebhookFetchForTest(async () => new Response(JSON.stringify({ message: "still down" }), { status: 502 }));

  await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: retryProviderId,
    input: hotelInput
  });
  await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: retryProviderId,
    input: { ...hotelInput, message: "Find hotels twice" }
  });

  const health = await getProviderHealthForUser({ userId: user.id, capabilityKey: "travel.search_hotels", providerId: retryProviderId });
  assert.equal(health[0]?.state, "failing");
  assert.match(health[0]?.message ?? "", /failed repeatedly/i);
});

test("active, disabled, and missing workflows produce clear provider health states", async () => {
  const active = await createUserAndAgent("active-config");
  await createWorkflow({ userId: active.user.id, agentId: active.agent.id, capabilityKey: "travel.search_hotels", status: "active" });
  const activeHealth = await getProviderHealthForUser({ userId: active.user.id, agentId: active.agent.id, capabilityKey: "travel.search_hotels" });
  assert.equal(activeHealth[0]?.state, "healthy");

  const disabled = await createUserAndAgent("disabled-config");
  await createWorkflow({ userId: disabled.user.id, agentId: disabled.agent.id, capabilityKey: "travel.search_hotels", status: "disabled" });
  const disabledHealth = await getProviderHealthForUser({ userId: disabled.user.id, agentId: disabled.agent.id, capabilityKey: "travel.search_hotels" });
  assert.equal(disabledHealth[0]?.state, "disabled");

  const missing = await createUserAndAgent("missing-config");
  const missingHealth = await getProviderHealthForUser({ userId: missing.user.id, agentId: missing.agent.id, capabilityKey: "travel.search_hotels" });
  assert.equal(missingHealth[0]?.state, "not_configured");
});

test("provider readiness summary reports ready workflow state", async () => {
  const active = await createUserAndAgent("summary-ready");
  await createWorkflow({ userId: active.user.id, agentId: active.agent.id, capabilityKey: "travel.search_hotels", status: "active" });

  const summary = await getProviderReadinessSummary({
    userId: active.user.id,
    agentId: active.agent.id,
    capabilityKey: "travel.search_hotels"
  });

  assert.equal(summary.status, "ready");
  assert.equal(summary.canRun, true);
  assert.equal(summary.setupSteps.length, 0);
  assert.equal(summary.primaryProviderId, "workflow");
});

test("provider readiness summary gives one setup action for missing workflow", async () => {
  const missing = await createUserAndAgent("summary-missing");

  const summary = await getProviderReadinessSummary({
    userId: missing.user.id,
    agentId: missing.agent.id,
    capabilityKey: "travel.search_hotels"
  });

  assert.equal(summary.status, "needs_setup");
  assert.equal(summary.canRun, false);
  assert.equal(summary.nextAction, "fix_workflow");
  assert.match(summary.title, /set up/i);
  assert.equal(summary.setupSteps.length, 1);
  assert.equal(summary.setupSteps[0]?.nextAction, "fix_workflow");
});

test("provider readiness summary prefers credential setup for connected-account providers", async () => {
  const missing = await createUserAndAgent("summary-credentials");

  const summary = await getProviderReadinessSummary({
    userId: missing.user.id,
    agentId: missing.agent.id,
    capabilityKey: "travel.search_hotels",
    providerId: credentialProviderId
  });

  assert.equal(summary.status, "needs_setup");
  assert.equal(summary.canRun, false);
  assert.equal(summary.primaryProviderId, credentialProviderId);
  assert.equal(summary.nextAction, "connect_account");
  assert.match(summary.title, /connect credential provider/i);
  assert.equal(summary.setupSteps[0]?.nextAction, "connect_account");
});

test("specific unknown providers do not fall back to workflow readiness", async () => {
  const active = await createUserAndAgent("summary-unknown-provider");
  await createWorkflow({ userId: active.user.id, agentId: active.agent.id, capabilityKey: "travel.search_hotels", status: "active" });

  const summary = await getProviderReadinessSummary({
    userId: active.user.id,
    agentId: active.agent.id,
    capabilityKey: "travel.search_hotels",
    providerId: `${testRunId}-missing-provider`
  });

  assert.equal(summary.status, "needs_setup");
  assert.equal(summary.canRun, false);
  assert.equal(summary.primaryProviderId, `${testRunId}-missing-provider`);
  assert.match(summary.message, /not registered/i);
});

test("provider readiness summary reports unhealthy after repeated provider failures", async () => {
  const { user, agent } = await createUserAndAgent("summary-failing");
  setWebhookFetchForTest(async () => new Response(JSON.stringify({ message: "still down" }), { status: 502 }));

  await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: retryProviderId,
    input: hotelInput
  });
  await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: retryProviderId,
    input: { ...hotelInput, message: "Find hotels again" }
  });

  const summary = await getProviderReadinessSummary({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    providerId: retryProviderId
  });

  assert.equal(summary.status, "unhealthy");
  assert.equal(summary.canRun, false);
  assert.equal(summary.nextAction, "try_again");
  assert.match(summary.title, /needs attention/i);
});

test("provider health API scopes results to the current user", async () => {
  const owner = await createUserAndAgent("api-owner");
  const outsider = await createUserAndAgent("api-outsider");
  setWebhookFetchForTest(async () => new Response(JSON.stringify({ reply: "Owner search worked." }), { status: 200 }));
  await executeConnector({
    userId: owner.user.id,
    agentId: owner.agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: retryProviderId,
    input: hotelInput
  });

  setWebhookFetchForTest(async () => new Response(JSON.stringify({ message: "outsider failure" }), { status: 502 }));
  await executeConnector({
    userId: outsider.user.id,
    agentId: outsider.agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: retryProviderId,
    input: { ...hotelInput, message: "Find outsider hotels" }
  });

  const response = await apiGet(`/api/provider-health?capabilityKey=travel.search_hotels&providerId=${retryProviderId}`, owner.user.id);
  assert.equal(response.status, 200);
  const body = await response.json() as { health: Array<{ state: string; recentSuccesses: number; recentFailures: number }> };
  assert.equal(body.health.length, 1);
  assert.equal(body.health[0]?.state, "healthy");
  assert.equal(body.health[0]?.recentSuccesses, 1);
  assert.equal(body.health[0]?.recentFailures, 0);
});

test("provider health summary API scopes results to the current user", async () => {
  const owner = await createUserAndAgent("summary-api-owner");
  await createWorkflow({ userId: owner.user.id, agentId: owner.agent.id, capabilityKey: "travel.search_hotels", status: "active" });

  const response = await apiGet("/api/provider-health/summary?capabilityKey=travel.search_hotels", owner.user.id);
  assert.equal(response.status, 200);
  const body = await response.json() as { summary: { status: string; canRun: boolean; setupSteps: unknown[] } };
  assert.equal(body.summary.status, "ready");
  assert.equal(body.summary.canRun, true);
  assert.equal(body.summary.setupSteps.length, 0);
});
