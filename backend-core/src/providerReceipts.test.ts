import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { prisma } from "./db/prisma.js";
import { createVaultSalt } from "./services/cryptoService.js";
import { decideHitlRequest } from "./services/hitlService.js";
import { encodeJson } from "./services/jsonService.js";
import {
  consumeApprovedHitlRequest,
  resumeApprovedToolRequest
} from "./services/runtimeApprovalService.js";
import { executeConnector } from "./services/connectorExecutionService.js";
import { createProviderReceipt } from "./services/providerReceiptService.js";
import {
  registerConnectorProvider,
  unregisterConnectorProvider
} from "./services/connectorProviderRegistryService.js";
import { createWorkflowConnection } from "./services/workflowConnectionService.js";
import { toolRegistry, type ToolDefinition } from "./services/toolRegistryService.js";
import { resetWebhookFetchForTest, setWebhookFetchForTest } from "./services/tools/adapters/webhookAdapter.js";

const testRunId = `provider-receipts-${Date.now()}`;
const testToolNames: string[] = [];
const testProviderIds: string[] = [];
let server: Server;
let baseUrl = "";

const hotelInput = {
  message: "Find hotels",
  destination: "Lisbon",
  checkInDate: "2026-08-12",
  checkOutDate: "2026-08-16",
  guests: 2
};

const flightInput = {
  message: "Find flights to Lisbon",
  origin: "Berlin",
  destination: "Lisbon",
  departureDate: "2026-08-12",
  passengers: 1
};

const bookingInput = {
  selectedOptionId: "hotel-123",
  maxApprovedTotal: 420,
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
      trustScore: 80,
      capabilityManifest: encodeJson({
        protocol: "MCP",
        tools: ["workflow.run"],
        requestedSchemas: [],
        highRiskActions: [],
        description: "Provider receipt test agent."
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

async function createActiveWorkflow(input: { userId: string; agentId: string; capabilityKey: string; endpointUrl?: string }) {
  const created = await createWorkflowConnection({
    userId: input.userId,
    agentId: input.agentId,
    name: "Receipt workflow",
    provider: "n8n",
    endpointUrl: input.endpointUrl ?? "https://workflow.example.test/receipt",
    capabilityKey: input.capabilityKey
  });
  await prisma.workflowConnection.update({
    where: { id: created.workflow.id },
    data: { status: "active" }
  });
  return created.workflow;
}

async function apiGet(path: string, userId: string) {
  return fetch(`${baseUrl}${path}`, { headers: { "x-user-id": userId } });
}

before(async () => {
  server = createApp().listen(0);
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  const toolName = `${testRunId}.book`;
  const providerId = `${testRunId}-booking-provider`;
  addTool({
    name: toolName,
    description: "Book a provider option after approval.",
    category: "travel",
    riskLevel: "high",
    requiresApproval: true,
    adapterType: "webhook",
    adapterConfig: { endpointUrl: "https://workflow.example.test/book", timeoutMs: 1000, maxResponseBytes: 4096 },
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  });
  registerConnectorProvider({
    providerId,
    label: "Receipt booking provider",
    kind: "workflow",
    toolName,
    capabilities: ["travel.search_hotels"],
    actions: ["execute_action"],
    requiresConnectedAccount: false,
    description: "Receipt test provider."
  });
  testProviderIds.push(providerId);
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
  await prisma.hitlRequest.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.toolRun.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.workflowConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

test("successful workflow connector creates a provider receipt with normalized result quality", async () => {
  const { user, agent } = await createUserAndAgent("success");
  await createActiveWorkflow({ userId: user.id, agentId: agent.id, capabilityKey: "travel.search_hotels" });
  setWebhookFetchForTest(async () => new Response(JSON.stringify({
    summary: "I found two stays.",
    hotels: [
      { name: "Central Stay", price: "$140/night", bookingUrl: "https://example.test/stay" },
      { name: "Quiet Rooms", price: "$120/night" }
    ],
    requestId: "receipt-success-1"
  }), { status: 200 }));

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.hotel.search",
    input: { ...hotelInput, message: "Find hotels in Lisbon" }
  });

  assert.equal(result.status, "ok");
  const receipt = await prisma.providerReceipt.findFirstOrThrow({ where: { userId: user.id, status: "succeeded" } });
  assert.equal(receipt.providerId, "workflow");
  assert.equal(receipt.capabilityKey, "travel.search_hotels");
  assert.equal(receipt.capabilityLabel, "Find hotels");
  assert.equal(receipt.resultQuality, "complete");
  assert.equal(receipt.itemCount, 2);
  assert.equal(receipt.externalRequestId, "receipt-success-1");
  assert.match(receipt.userMessage, /two stays/i);
});

test("missing workflow creates a blocked provider receipt", async () => {
  const { user, agent } = await createUserAndAgent("missing");
  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.flight.search",
    input: flightInput
  });

  assert.equal(result.status, "blocked");
  const receipt = await prisma.providerReceipt.findFirstOrThrow({ where: { userId: user.id, status: "blocked" } });
  assert.equal(receipt.nextAction, "fix_workflow");
  assert.equal(receipt.retryable, true);
  assert.match(receipt.userMessage, /Find flights|workflow/i);
});

test("provider HTTP failure creates a blocked provider receipt with safe technical detail", async () => {
  const { user, agent } = await createUserAndAgent("provider-failure");
  await createActiveWorkflow({ userId: user.id, agentId: agent.id, capabilityKey: "travel.search_hotels" });
  setWebhookFetchForTest(async () => new Response(JSON.stringify({ message: "bad gateway from provider" }), { status: 502 }));

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    input: { ...hotelInput, message: "Find hotels in Rome", destination: "Rome" }
  });

  assert.equal(result.status, "blocked");
  const receipt = await prisma.providerReceipt.findFirstOrThrow({ where: { userId: user.id, status: "blocked" } });
  assert.equal(receipt.retryable, true);
  assert.equal(receipt.nextAction, "try_again");
  assert.match(receipt.technicalMessage ?? "", /workflow|HTTP 502/i);
  assert.doesNotMatch(receipt.userMessage, /bad gateway from provider/i);
});

test("high-risk provider action creates waiting and resumed receipts without duplicates", async () => {
  const { user, agent } = await createUserAndAgent("approval");
  const providerId = `${testRunId}-booking-provider`;
  const first = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.hotel.search",
    action: "execute_action",
    preferredProviderId: providerId,
    input: bookingInput,
    idempotencyKey: `${testRunId}-approval-action`
  });
  assert.equal(first.status, "awaiting_human_approval");
  if (first.status !== "awaiting_human_approval") throw new Error("Expected approval.");

  const waitingReceipts = await prisma.providerReceipt.findMany({ where: { userId: user.id, status: "waiting_for_approval" } });
  assert.equal(waitingReceipts.length, 1);
  assert.equal(waitingReceipts[0]?.approvalRequired, true);
  assert.equal(waitingReceipts[0]?.hitlRequestId, first.requestId);

  const repeated = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.hotel.search",
    action: "execute_action",
    preferredProviderId: providerId,
    input: bookingInput,
    idempotencyKey: `${testRunId}-approval-action`
  });
  assert.equal(repeated.status, "awaiting_human_approval");
  assert.equal(await prisma.providerReceipt.count({ where: { userId: user.id, status: "waiting_for_approval" } }), 1);

  setWebhookFetchForTest(async () => new Response(JSON.stringify({ reply: "Hotel booked.", requestId: "booked-1" }), { status: 200 }));
  await decideHitlRequest(first.requestId, user.id, true);
  const continuation = await consumeApprovedHitlRequest({
    userId: user.id,
    agentId: agent.id,
    missingReply: "Missing approval.",
    missingReason: "No approval.",
    usedReply: "Used approval."
  });
  assert.equal(continuation.status, "ready");
  if (continuation.status !== "ready") throw new Error("Expected consumed approval.");
  const resumed = await resumeApprovedToolRequest({ request: continuation.request });
  assert.equal(resumed.status, "resumed");

  const succeededReceipt = await prisma.providerReceipt.findFirstOrThrow({
    where: { userId: user.id, status: "succeeded", hitlRequestId: first.requestId }
  });
  assert.equal(succeededReceipt.approvalRequired, true);
  assert.match(succeededReceipt.userMessage, /booked|completed/i);
  const approvalRun = await prisma.toolRun.findUniqueOrThrow({ where: { id: first.toolRunId } });
  assert.equal(approvalRun.status, "succeeded");
});

test("provider receipt API returns only the current user's receipts", async () => {
  const owner = await createUserAndAgent("api-owner");
  const outsider = await createUserAndAgent("api-outsider");
  await createActiveWorkflow({ userId: owner.user.id, agentId: owner.agent.id, capabilityKey: "travel.search_hotels" });
  await createActiveWorkflow({ userId: outsider.user.id, agentId: outsider.agent.id, capabilityKey: "travel.search_hotels" });
  setWebhookFetchForTest(async () => new Response(JSON.stringify({
    summary: "One owner result.",
    hotels: [{ name: "Owner Stay", price: "$100" }]
  }), { status: 200 }));
  await executeConnector({
    userId: owner.user.id,
    agentId: owner.agent.id,
    capabilityKey: "travel.search_hotels",
    input: { ...hotelInput, message: "Find owner hotels" }
  });

  setWebhookFetchForTest(async () => new Response(JSON.stringify({
    summary: "One outsider result.",
    hotels: [{ name: "Outsider Stay", price: "$90" }]
  }), { status: 200 }));
  await executeConnector({
    userId: outsider.user.id,
    agentId: outsider.agent.id,
    capabilityKey: "travel.search_hotels",
    input: { ...hotelInput, message: "Find outsider hotels" }
  });

  const response = await apiGet("/api/provider-receipts?limit=20", owner.user.id);
  assert.equal(response.status, 200);
  const body = await response.json() as { receipts: Array<{ agentName: string; userMessage: string }> };
  assert.equal(body.receipts.length, 1);
  assert.equal(body.receipts[0]?.agentName, owner.agent.name);
  assert.match(body.receipts[0]?.userMessage ?? "", /owner/i);
});

test("provider receipt API supports filters, limits, display fields, and sanitized metadata", async () => {
  const owner = await createUserAndAgent("api-filters");
  const otherAgent = await prisma.agent.create({
    data: {
      name: `${testRunId}-api-filters-other-agent`,
      category: "Travel",
      apiProtocol: "MCP",
      trustScore: 70,
      capabilityManifest: encodeJson({
        protocol: "MCP",
        tools: ["workflow.run"],
        requestedSchemas: [],
        highRiskActions: [],
        description: "Second receipt test agent."
      })
    }
  });
  await prisma.userConnection.create({
    data: {
      userId: owner.user.id,
      agentId: otherAgent.id,
      connectionStatus: "active",
      tokenExpiresAt: new Date(Date.now() + 60_000)
    }
  });

  await createProviderReceipt({
    userId: owner.user.id,
    agentId: owner.agent.id,
    providerId: "booking-workflow",
    providerLabel: "Booking workflow",
    capabilityKey: "travel.search_hotels",
    capabilityLabel: "Find hotels",
    action: "search",
    status: "succeeded",
    resultQuality: "complete",
    userMessage: "Found three hotel options near the city center.",
    itemCount: 3,
    externalRequestId: "safe-request-id",
    endpointHost: "booking.example.test",
    metadata: {
      token: "must-not-leak",
      authorizationHeader: "must-not-leak",
      query: "Lisbon",
      resultCount: 3
    }
  });
  await createProviderReceipt({
    userId: owner.user.id,
    agentId: owner.agent.id,
    providerId: "booking-workflow",
    providerLabel: "Booking workflow",
    capabilityKey: "travel.book_hotel",
    capabilityLabel: "Book hotel",
    action: "execute_action",
    status: "waiting_for_approval",
    approvalRequired: true,
    hitlRequestId: `${testRunId}-hitl-filter`,
    userMessage: "The agent paused before booking a non-refundable hotel.",
    nextAction: "review_approval"
  });
  await createProviderReceipt({
    userId: owner.user.id,
    agentId: otherAgent.id,
    providerId: "calendar-workflow",
    providerLabel: "Calendar workflow",
    capabilityKey: "calendar.find_time",
    capabilityLabel: "Find time",
    action: "search",
    status: "blocked",
    userMessage: "The calendar connection needs attention before this can run.",
    retryable: true,
    nextAction: "connect_account"
  });
  await createProviderReceipt({
    userId: owner.user.id,
    agentId: otherAgent.id,
    providerId: "broken-workflow",
    providerLabel: "Broken workflow",
    capabilityKey: "general.research",
    capabilityLabel: "Research",
    action: "book_non_refundable_travel",
    status: "blocked",
    userMessage: "provider_error: workflow failed with internal server error",
    retryable: false,
    nextAction: "fix_workflow"
  });

  const allResponse = await apiGet("/api/provider-receipts?limit=4", owner.user.id);
  assert.equal(allResponse.status, 200);
  const allBody = await allResponse.json() as { receipts: Array<{ id: string; display?: { title: string; summary: string; category: string; externalService: string; nextStep?: string }; metadata: Record<string, unknown> }> };
  assert.equal(allBody.receipts.length, 4);
  assert.ok(allBody.receipts.every((receipt) => receipt.display?.category === "provider"));
  assert.doesNotMatch(JSON.stringify(allBody), /must-not-leak|authorizationHeader|token/i);
  assert.doesNotMatch(JSON.stringify(allBody.receipts.map((receipt) => receipt.display)), /execute_action|review_approval/i);
  assert.ok(allBody.receipts.some((receipt) => receipt.display?.title === "Book hotel needs your approval"));
  assert.ok(allBody.receipts.some((receipt) => receipt.display?.summary.includes("Nothing happens unless you allow it.")));
  assert.doesNotMatch(JSON.stringify(allBody.receipts.map((receipt) => receipt.display)), /provider_error|book_non_refundable_travel|internal server error/i);

  const agentResponse = await apiGet(`/api/provider-receipts?agentId=${owner.agent.id}&limit=20`, owner.user.id);
  const agentBody = await agentResponse.json() as { receipts: Array<{ agentId: string }> };
  assert.equal(agentBody.receipts.length, 2);
  assert.ok(agentBody.receipts.every((receipt) => receipt.agentId === owner.agent.id));

  const statusResponse = await apiGet("/api/provider-receipts?status=blocked&limit=20", owner.user.id);
  const statusBody = await statusResponse.json() as { receipts: Array<{ status: string; display?: { badge: string } }> };
  assert.equal(statusBody.receipts.length, 2);
  assert.ok(statusBody.receipts.every((receipt) => receipt.status === "blocked"));
  assert.ok(statusBody.receipts.every((receipt) => receipt.display?.badge === "Blocked"));

  const capabilityResponse = await apiGet("/api/provider-receipts?capabilityKey=travel.search_hotels&limit=20", owner.user.id);
  const capabilityBody = await capabilityResponse.json() as { receipts: Array<{ capabilityKey: string; metadata: Record<string, unknown>; display?: { externalService: string } }> };
  assert.equal(capabilityBody.receipts.length, 1);
  assert.equal(capabilityBody.receipts[0]?.capabilityKey, "travel.search_hotels");
  assert.equal(capabilityBody.receipts[0]?.metadata.query, "Lisbon");
  assert.equal(capabilityBody.receipts[0]?.display?.externalService, "Booking workflow");
});
