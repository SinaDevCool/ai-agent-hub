import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "./db/prisma.js";
import { createVaultSalt } from "./services/cryptoService.js";
import { encodeJson } from "./services/jsonService.js";
import { executeTool } from "./services/toolExecutionService.js";
import { toolRegistry, type ToolDefinition } from "./services/toolRegistryService.js";

const testRunId = `tool-policy-${Date.now()}`;
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
        description: "Tool policy test agent."
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

before(() => {
  addTool({
    name: `${testRunId}.requires-input`,
    description: "Needs an explicit destination.",
    category: "travel",
    riskLevel: "medium",
    requiresApproval: false,
    adapterType: "webhook",
    inputSchema: {
      type: "object",
      properties: { destination: { type: "string" } },
      required: ["destination"]
    },
    outputSchema: { type: "object" }
  });
  addTool({
    name: `${testRunId}.needs-provider`,
    description: "Needs an active provider connection.",
    category: "finance",
    riskLevel: "medium",
    requiresApproval: false,
    adapterType: "openapi",
    requiredConnector: "finance",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  });
  addTool({
    name: `${testRunId}.dangerous-action`,
    description: "A risky provider action.",
    category: "travel",
    riskLevel: "high",
    requiresApproval: true,
    adapterType: "webhook",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  });
});

after(async () => {
  for (const name of testToolNames) {
    const index = toolRegistry.findIndex((tool) => tool.name === name);
    if (index >= 0) toolRegistry.splice(index, 1);
  }
  await prisma.hitlRequest.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.toolRun.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.connectedAccount.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

test("tool execution policy blocks missing required fields before adapter execution", async () => {
  const { user, agent } = await createUserAndAgent("input");

  const result = await executeTool({
    userId: user.id,
    agentId: agent.id,
    toolName: `${testRunId}.requires-input`,
    arguments: {}
  });

  assert.equal(result.status, "blocked");
  if (result.status === "blocked") {
    assert.equal(result.code, "invalid_input");
    assert.equal(result.nextAction, "try_again");
    assert.match(result.reason, /destination/i);
  }
});

test("tool execution policy blocks provider tools without an active connected account", async () => {
  const { user, agent } = await createUserAndAgent("connector");

  const result = await executeTool({
    userId: user.id,
    agentId: agent.id,
    toolName: `${testRunId}.needs-provider`,
    arguments: {}
  });

  assert.equal(result.status, "blocked");
  if (result.status === "blocked") {
    assert.equal(result.code, "connector_not_connected");
    assert.equal(result.nextAction, "connect_account");
    assert.match(result.reason, /connect finance/i);
  }
});

test("tool execution policy turns high-risk tools into approval requests before adapter execution", async () => {
  const { user, agent } = await createUserAndAgent("approval");

  const result = await executeTool({
    userId: user.id,
    agentId: agent.id,
    toolName: `${testRunId}.dangerous-action`,
    arguments: { hotelId: "hotel-123" }
  });

  assert.equal(result.status, "awaiting_human_approval");
  if (result.status === "awaiting_human_approval") {
    const request = await prisma.hitlRequest.findUniqueOrThrow({ where: { id: result.requestId } });
    assert.equal(request.actionName, `${testRunId}_dangerous-action`);
    assert.match(request.payload, /hotel-123/);
  }
});
