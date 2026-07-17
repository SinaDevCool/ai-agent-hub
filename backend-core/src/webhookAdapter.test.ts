import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { prisma } from "./db/prisma.js";
import { createVaultSalt } from "./services/cryptoService.js";
import { encodeJson } from "./services/jsonService.js";
import { executeTool } from "./services/toolExecutionService.js";
import { toolRegistry, type ToolDefinition } from "./services/toolRegistryService.js";
import { resetWebhookFetchForTest, setWebhookFetchForTest } from "./services/tools/adapters/webhookAdapter.js";

const testRunId = `webhook-adapter-${Date.now()}`;
const testToolNames: string[] = [];

function addWebhookTool(name: string, endpointUrl: string, extraConfig: Record<string, unknown> = {}) {
  const definition: ToolDefinition = {
    name,
    description: "Test webhook tool.",
    category: "action",
    riskLevel: "medium",
    requiresApproval: false,
    adapterType: "webhook",
    adapterConfig: { endpointUrl, timeoutMs: 1000, maxResponseBytes: 4096, ...extraConfig },
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  };
  toolRegistry.push(definition);
  testToolNames.push(name);
  return definition;
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
        description: "Webhook adapter test agent."
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

afterEach(() => {
  resetWebhookFetchForTest();
});

after(async () => {
  for (const name of testToolNames) {
    const index = toolRegistry.findIndex((tool) => tool.name === name);
    if (index >= 0) toolRegistry.splice(index, 1);
  }
  await prisma.toolRun.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

before(() => {
  addWebhookTool(`${testRunId}.unsafe`, "http://localhost:5678/webhook");
  addWebhookTool(`${testRunId}.safe`, "https://workflow.example.test/run");
  addWebhookTool(`${testRunId}.provider-error`, "https://workflow.example.test/fail");
  addWebhookTool(`${testRunId}.timeout`, "https://workflow.example.test/slow");
});

test("webhook adapter blocks unsafe URLs and records a blocked ToolRun", async () => {
  const { user, agent } = await createUserAndAgent("unsafe");
  setWebhookFetchForTest(async () => {
    throw new Error("Unsafe webhook URL must not be fetched.");
  });

  const result = await executeTool({
    userId: user.id,
    agentId: agent.id,
    toolName: `${testRunId}.unsafe`,
    arguments: { destination: "Rome" }
  });

  assert.equal(result.status, "blocked");
  assert.match(result.reason, /https|localhost/i);
  const run = await prisma.toolRun.findUniqueOrThrow({ where: { id: result.toolRunId } });
  assert.equal(run.status, "blocked");
});

test("webhook adapter calls a safe endpoint, sanitizes the reply, and records success", async () => {
  const { user, agent } = await createUserAndAgent("safe");
  setWebhookFetchForTest(async (url, init) => {
    assert.equal(new URL(String(url)).hostname, "workflow.example.test");
    const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    assert.equal(payload.userId, user.id);
    assert.equal(payload.agentId, agent.id);
    assert.equal(payload.toolName, `${testRunId}.safe`);
    return new Response(JSON.stringify({
      reply: "<b>Found three good options.</b><script>alert('x')</script>",
      requestId: "external-123"
    }), { status: 200, headers: { "content-type": "application/json" } });
  });

  const result = await executeTool({
    userId: user.id,
    agentId: agent.id,
    toolName: `${testRunId}.safe`,
    arguments: { destination: "Rome", nights: 3 }
  });

  assert.equal(result.status, "ok");
  assert.equal(result.result?.provider, "webhook");
  assert.equal(result.result?.reply, "Found three good options.");
  assert.equal(result.result?.externalRequestId, "external-123");
  const run = await prisma.toolRun.findUniqueOrThrow({ where: { id: result.toolRunId } });
  assert.equal(run.status, "succeeded");
});

test("webhook adapter blocks provider failures", async () => {
  const { user, agent } = await createUserAndAgent("provider-error");
  setWebhookFetchForTest(async () => new Response(JSON.stringify({ message: "bad gateway" }), { status: 502 }));

  const result = await executeTool({
    userId: user.id,
    agentId: agent.id,
    toolName: `${testRunId}.provider-error`,
    arguments: {}
  });

  assert.equal(result.status, "blocked");
  if (result.status === "blocked") {
    assert.equal(result.code, "provider_error");
    assert.match(result.reason, /workflow/i);
    assert.match(result.technicalMessage ?? "", /HTTP 502/);
  }
});

test("webhook adapter blocks timeout-style aborts", async () => {
  const { user, agent } = await createUserAndAgent("timeout");
  setWebhookFetchForTest(async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  });

  const result = await executeTool({
    userId: user.id,
    agentId: agent.id,
    toolName: `${testRunId}.timeout`,
    arguments: {}
  });

  assert.equal(result.status, "blocked");
  if (result.status === "blocked") {
    assert.equal(result.code, "provider_unavailable");
    assert.match(result.reason, /too long/i);
    assert.match(result.technicalMessage ?? "", /too long/i);
  }
});
