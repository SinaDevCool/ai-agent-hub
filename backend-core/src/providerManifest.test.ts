import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { prisma } from "./db/prisma.js";
import { createVaultSalt } from "./services/cryptoService.js";
import { encodeJson } from "./services/jsonService.js";
import { executeConnector } from "./services/connectorExecutionService.js";
import { registerProviderAdapter, unregisterConnectorProvider } from "./services/connectorProviderRegistryService.js";
import type { ProviderAdapter } from "./services/providers/providerAdapterTypes.js";

const testRunId = `provider-manifest-${Date.now()}`;
const schemaProviderId = `${testRunId}-schema-provider`;
const actionProviderId = `${testRunId}-action-provider`;
let server: Server;
let baseUrl = "";
let schemaProviderCalls = 0;
let actionProviderCalls = 0;

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
      trustScore: 88,
      capabilityManifest: encodeJson({
        protocol: "MCP",
        tools: ["provider.execute"],
        requestedSchemas: [],
        highRiskActions: [],
        description: "Provider manifest test agent."
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

async function apiGet(path: string, userId: string) {
  return fetch(`${baseUrl}${path}`, { headers: { "x-user-id": userId } });
}

before(() => {
  server = createApp().listen(0);
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  registerProviderAdapter({
    providerId: schemaProviderId,
    label: "Schema Provider",
    kind: "api",
    toolName: "schema.provider.execute",
    capabilities: ["travel.search_hotels"],
    actions: ["search"],
    requiresConnectedAccount: false,
    authType: "none",
    riskLevel: "low",
    supportsHealthCheck: false,
    description: "Provider with explicit action schema.",
    canHandle(input) {
      if (input.preferredProviderId && input.preferredProviderId !== schemaProviderId) return false;
      return input.capabilityKey === "travel.search_hotels" && input.action === "search";
    },
    actionSchemas: [{
      capabilityKey: "travel.search_hotels",
      action: "search",
      riskLevel: "low",
      requiresApproval: false,
      inputSchema: {
        destination: { type: "string", description: "Where to stay." },
        guests: { type: "number", description: "Number of guests." }
      },
      requiredFields: ["destination"],
      outputSchema: { hotels: "array" },
      examples: [{ destination: "<b>Lisbon</b>", apiKey: "must-not-leak" }],
      userPrompt: "Where do you want to stay?",
      missingInputMessage: "Add a destination before this agent can search hotels.",
      allowExtraFields: true
    }],
    async execute(input) {
      schemaProviderCalls += 1;
      return {
        status: "ok",
        toolRunId: `${testRunId}-schema-tool-${input.attempt}`,
        result: {
          reply: `Found stays in ${String(input.input.destination)}`,
          hotels: [{ name: "Central Stay", price: "$120" }]
        }
      };
    }
  });

  registerProviderAdapter({
    providerId: actionProviderId,
    label: "Action Schema Provider",
    kind: "api",
    toolName: "action.schema.provider.execute",
    capabilities: ["travel.search_hotels"],
    actions: ["execute_action"],
    requiresConnectedAccount: false,
    authType: "none",
    riskLevel: "low",
    supportsHealthCheck: false,
    description: "Provider with approval-required action schema.",
    canHandle(input) {
      if (input.preferredProviderId && input.preferredProviderId !== actionProviderId) return false;
      return input.capabilityKey === "travel.search_hotels" && input.action === "execute_action";
    },
    actionSchemas: [{
      capabilityKey: "travel.search_hotels",
      action: "execute_action",
      riskLevel: "high",
      requiresApproval: true,
      inputSchema: {
        actionName: { type: "string", description: "Action to perform." },
        hotelId: { type: "string", description: "Selected hotel id." }
      },
      requiredFields: ["actionName", "hotelId"],
      outputSchema: { confirmation: "string" },
      examples: [{ actionName: "book_refundable_hotel", hotelId: "hotel-1" }],
      userPrompt: "Choose the action to approve.",
      missingInputMessage: "Choose a hotel before this agent can book it.",
      allowExtraFields: true
    }],
    async execute(input) {
      actionProviderCalls += 1;
      return {
        status: "ok",
        toolRunId: `${testRunId}-action-tool-${input.attempt}`,
        result: { reply: "Action completed." }
      };
    }
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  unregisterConnectorProvider(schemaProviderId);
  unregisterConnectorProvider(actionProviderId);
  await prisma.providerReceipt.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.hitlRequest.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.toolRun.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

test("invalid provider manifests are rejected at registration", () => {
  assert.throws(() => registerProviderAdapter({
    providerId: `${testRunId}-bad-provider`,
    label: "Bad Provider",
    kind: "api",
    toolName: "bad.provider",
    capabilities: ["unknown.capability"],
    actions: ["search"],
    requiresConnectedAccount: false,
    authType: "none",
    riskLevel: "low",
    supportsHealthCheck: false,
    description: "Invalid provider.",
    canHandle: () => true,
    execute: async () => ({ status: "ok", toolRunId: "bad", result: {} })
  } as ProviderAdapter), /unknown capability|invalid/i);
});

test("missing required schema input blocks before the provider is called", async () => {
  const { user, agent } = await createUserAndAgent("missing");
  schemaProviderCalls = 0;
  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: schemaProviderId,
    input: { guests: 2 }
  });
  assert.equal(result.status, "blocked");
  if (result.status === "blocked") {
    assert.equal(result.code, "invalid_input");
    assert.match(result.userMessage ?? "", /destination/i);
  }
  assert.equal(schemaProviderCalls, 0);
});

test("valid schema input executes and allows harmless extra fields", async () => {
  const { user, agent } = await createUserAndAgent("valid");
  schemaProviderCalls = 0;
  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: schemaProviderId,
    input: { destination: "Lisbon", guests: 2, note: "quiet area" }
  });
  assert.equal(result.status, "ok");
  assert.equal(schemaProviderCalls, 1);
});

test("invalid schema field type blocks with a client-safe message", async () => {
  const { user, agent } = await createUserAndAgent("invalid-type");
  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: schemaProviderId,
    input: { destination: "Lisbon", guests: "two" }
  });
  assert.equal(result.status, "blocked");
  if (result.status === "blocked") {
    assert.equal(result.code, "invalid_input");
    assert.match(result.userMessage ?? "", /clearer format/i);
  }
});

test("high-risk action schema pauses for approval before provider execution", async () => {
  const { user, agent } = await createUserAndAgent("approval");
  actionProviderCalls = 0;
  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    action: "execute_action",
    preferredProviderId: actionProviderId,
    input: { actionName: "book_refundable_hotel", hotelId: "hotel-1" }
  });
  assert.equal(result.status, "awaiting_human_approval");
  assert.equal(actionProviderCalls, 0);
});

test("provider discovery includes sanitized action schemas", async () => {
  const { user } = await createUserAndAgent("discovery");
  const response = await apiGet("/api/connectors/providers", user.id);
  assert.equal(response.status, 200);
  const body = await response.json() as {
    providers: Array<{ providerId: string; actionSchemas: Array<{ examples: Array<Record<string, unknown>>; requiredFields: string[] }> }>;
  };
  const provider = body.providers.find((item) => item.providerId === schemaProviderId);
  assert.ok(provider);
  assert.ok(provider?.actionSchemas[0]?.requiredFields.includes("destination"));
  assert.doesNotMatch(JSON.stringify(provider), /apiKey|must-not-leak|<b>/i);
});
