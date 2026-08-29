import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import type { HitlRequest } from "@prisma/client";
import { prisma } from "./db/prisma.js";
import { createVaultSalt } from "./services/cryptoService.js";
import { decideHitlRequest } from "./services/hitlService.js";
import { decodeJson, encodeJson } from "./services/jsonService.js";
import {
  consumeApprovedHitlRequest,
  resumeApprovedToolRequest
} from "./services/runtimeApprovalService.js";
import { executeTool } from "./services/toolExecutionService.js";
import { toolRegistry, type ToolDefinition } from "./services/toolRegistryService.js";
import { resetWebhookFetchForTest, setWebhookFetchForTest } from "./services/tools/adapters/webhookAdapter.js";

const testRunId = `approved-resume-${Date.now()}`;
const testToolNames: string[] = [];

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
        tools: [],
        requestedSchemas: [],
        highRiskActions: [],
        description: "Approved tool resume test agent."
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

async function approveToolRequest(input: { userId: string; agentId: string; toolName: string; args?: Record<string, unknown> }) {
  const first = await executeTool({
    userId: input.userId,
    agentId: input.agentId,
    toolName: input.toolName,
    arguments: input.args ?? { bookingId: "booking-123" }
  });
  assert.equal(first.status, "awaiting_human_approval");
  if (first.status !== "awaiting_human_approval") throw new Error("Expected approval request.");
  await decideHitlRequest(first.requestId, input.userId, true);
  const continuation = await consumeApprovedHitlRequest({
    userId: input.userId,
    agentId: input.agentId,
    missingReply: "Missing approval.",
    missingReason: "No approval.",
    usedReply: "Used approval."
  });
  assert.equal(continuation.status, "ready");
  if (continuation.status !== "ready") throw new Error("Expected approved request.");
  return continuation.request;
}

before(() => {
  addTool({
    name: `${testRunId}.book`,
    description: "Book a provider option after approval.",
    category: "travel",
    riskLevel: "high",
    requiresApproval: true,
    adapterType: "webhook",
    adapterConfig: { endpointUrl: "https://workflow.example.test/book", timeoutMs: 1000, maxResponseBytes: 4096 },
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  });
  addTool({
    name: `${testRunId}.fail`,
    description: "Fail a provider option after approval.",
    category: "travel",
    riskLevel: "high",
    requiresApproval: true,
    adapterType: "webhook",
    adapterConfig: { endpointUrl: "https://workflow.example.test/fail", timeoutMs: 1000, maxResponseBytes: 4096 },
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  });
});

afterEach(() => {
  resetWebhookFetchForTest();
});

after(async () => {
  for (const name of testToolNames) {
    const index = toolRegistry.findIndex((tool) => tool.name === name);
    if (index >= 0) toolRegistry.splice(index, 1);
  }
  await prisma.hitlRequest.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.toolRun.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

test("approved high-risk tool resumes the stored provider command once", async () => {
  const { user, agent } = await createUserAndAgent("success");
  let calls = 0;
  setWebhookFetchForTest(async (_url, init) => {
    calls += 1;
    const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    assert.equal(payload.toolName, `${testRunId}.book`);
    assert.deepEqual(payload.input, { bookingId: "booking-123" });
    return new Response(JSON.stringify({ reply: "Booking prepared.", requestId: "provider-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  const request = await approveToolRequest({ userId: user.id, agentId: agent.id, toolName: `${testRunId}.book` });
  const resumed = await resumeApprovedToolRequest({ request });
  const resumedAgain = await resumeApprovedToolRequest({ request });

  assert.equal(resumed.status, "resumed");
  assert.equal(resumedAgain.status, "resumed");
  if (resumed.status === "resumed" && resumedAgain.status === "resumed") {
    assert.equal(resumed.result.status, "ok");
    assert.equal(resumedAgain.result.status, "ok");
    assert.equal(resumed.result.toolRunId, resumedAgain.result.toolRunId);
  }
  assert.equal(calls, 1);
});

test("approval binding rejects changed arguments before provider execution", async () => {
  const { user, agent } = await createUserAndAgent("tampered-arguments");
  let calls = 0;
  setWebhookFetchForTest(async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const request = await approveToolRequest({ userId: user.id, agentId: agent.id, toolName: `${testRunId}.book`, args: { bookingId: "approved-booking" } });
  const payload = decodeJson<Record<string, unknown>>(request.payload, {});
  const tampered = {
    ...request,
    payload: encodeJson({ ...payload, arguments: { bookingId: "different-booking" } })
  };
  const resumed = await resumeApprovedToolRequest({ request: tampered });
  assert.equal(resumed.status, "blocked");
  assert.equal(calls, 0);
});

test("denied approval cannot be consumed for execution", async () => {
  const { user, agent } = await createUserAndAgent("denied");
  const first = await executeTool({
    userId: user.id,
    agentId: agent.id,
    toolName: `${testRunId}.book`,
    arguments: { bookingId: "booking-denied" }
  });
  assert.equal(first.status, "awaiting_human_approval");
  if (first.status !== "awaiting_human_approval") throw new Error("Expected approval request.");
  await decideHitlRequest(first.requestId, user.id, false);

  const continuation = await consumeApprovedHitlRequest({
    userId: user.id,
    agentId: agent.id,
    missingReply: "Missing approval.",
    missingReason: "No unused, approved request.",
    usedReply: "Used approval."
  });

  assert.equal(continuation.status, "blocked");
});

test("expired approval cannot be consumed for execution", async () => {
  const { user, agent } = await createUserAndAgent("expired");
  await prisma.hitlRequest.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      actionName: `${testRunId}_book`,
      riskLevel: "high",
      status: "success",
      payload: encodeJson({ toolName: `${testRunId}.book`, arguments: { bookingId: "expired" } }),
      decidedAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() - 1000)
    }
  });

  const continuation = await consumeApprovedHitlRequest({
    userId: user.id,
    agentId: agent.id,
    missingReply: "Missing approval.",
    missingReason: "No unexpired approval.",
    usedReply: "Used approval."
  });

  assert.equal(continuation.status, "blocked");
});

test("consuming an approval twice blocks the second continuation", async () => {
  const { user, agent } = await createUserAndAgent("double");
  const request = await approveToolRequest({ userId: user.id, agentId: agent.id, toolName: `${testRunId}.book`, args: { bookingId: "double" } });
  const consumed = await prisma.hitlRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.ok(consumed.continuedAt);

  const continuation = await consumeApprovedHitlRequest({
    userId: user.id,
    agentId: agent.id,
    missingReply: "Missing approval.",
    missingReason: "No unused approval.",
    usedReply: "Used approval."
  });

  assert.equal(continuation.status, "blocked");
});

test("provider failure after approval returns a client-safe blocked result", async () => {
  const { user, agent } = await createUserAndAgent("failure");
  setWebhookFetchForTest(async () => new Response(JSON.stringify({ message: "bad gateway" }), { status: 502 }));

  const request = await approveToolRequest({ userId: user.id, agentId: agent.id, toolName: `${testRunId}.fail` });
  const resumed = await resumeApprovedToolRequest({ request });

  assert.equal(resumed.status, "resumed");
  if (resumed.status === "resumed") {
    assert.equal(resumed.result.status, "blocked");
    if (resumed.result.status === "blocked") {
      assert.equal(resumed.result.code, "provider_error");
      assert.match(resumed.result.reason, /workflow/i);
      assert.match(resumed.result.technicalMessage ?? "", /HTTP 502/);
    }
  }
});

test("legacy approval payload returns a safe blocked resume result", async () => {
  const { user, agent } = await createUserAndAgent("legacy");
  const request = await prisma.hitlRequest.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      actionName: "legacy_action",
      riskLevel: "high",
      status: "success",
      payload: encodeJson({ actionName: "legacy_action" }),
      decidedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      continuedAt: new Date()
    }
  });

  const resumed = await resumeApprovedToolRequest({ request: request as HitlRequest });

  assert.equal(resumed.status, "blocked");
  if (resumed.status === "blocked") {
    assert.match(resumed.reason, /cannot be continued safely/i);
  }
});
