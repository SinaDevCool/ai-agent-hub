import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { prisma } from "./db/prisma.js";
import { createVaultSalt } from "./services/cryptoService.js";
import { executeConnector } from "./services/connectorExecutionService.js";
import {
  registerConnectorProvider,
  unregisterConnectorProvider
} from "./services/connectorProviderRegistryService.js";
import {
  resetProviderRuntimeFetchForTest,
  setProviderRuntimeFetchForTest
} from "./services/providers/providerRuntimeAdapterService.js";
import { encodeJson } from "./services/jsonService.js";
import { createProviderConnection } from "./services/providerConnectionService.js";

const testRunId = `provider-runtime-${Date.now()}`;
const providerIds: string[] = [];

const hotelInput = {
  message: "Find hotels in Lisbon",
  destination: "Lisbon",
  checkInDate: "2026-08-12",
  checkOutDate: "2026-08-16",
  guests: 2
};

const financeInput = {
  message: "Review spending",
  accountSource: "main card",
  startDate: "2026-07-01",
  endDate: "2026-07-31"
};

const bookingInput = {
  selectedOptionId: "hotel-123",
  maxApprovedTotal: 280,
  cancellationRuleAcknowledged: true
};

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
        tools: ["provider.runtime"],
        requestedSchemas: [],
        highRiskActions: [],
        description: "Provider runtime adapter test agent."
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

function registerApiProvider(providerId: string, capabilities = ["travel.search_hotels"]) {
  registerConnectorProvider({
    providerId,
    label: "Generic API provider",
    kind: "api",
    toolName: `${providerId}.runtime`,
    capabilities,
    actions: ["search", "quote", "reserve"],
    requiresConnectedAccount: false,
    authType: "none",
    riskLevel: "medium",
    runtimeConfig: {
      endpointUrl: "https://provider.example.test/runtime",
      timeoutMs: 1000,
      maxResponseBytes: 4096
    },
    description: "Generic direct API runtime provider."
  });
  providerIds.push(providerId);
}

function registerMcpProvider(providerId: string, tools = [{
  name: "searchHotels",
  capabilityKey: "travel.search_hotels",
  action: "search" as const,
  description: "Search hotels"
}]) {
  registerConnectorProvider({
    providerId,
    label: "Imported MCP provider",
    kind: "mcp",
    toolName: `${providerId}.runtime`,
    capabilities: ["travel.search_hotels"],
    actions: ["search", "reserve"],
    requiresConnectedAccount: false,
    authType: "none",
    riskLevel: "medium",
    runtimeConfig: {
      endpointUrl: "https://mcp.example.test/rpc",
      timeoutMs: 1000,
      maxResponseBytes: 4096,
      mcpTools: tools
    },
    description: "Imported MCP runtime provider."
  });
  providerIds.push(providerId);
}

function registerOpenApiProvider(providerId: string, operations = [{
  operationId: "searchHotels",
  capabilityKey: "travel.search_hotels",
  action: "search" as const,
  path: "/hotels/search",
  method: "GET" as const,
  summary: "Search hotels"
}]) {
  registerConnectorProvider({
    providerId,
    label: "Imported OpenAPI provider",
    kind: "openapi",
    toolName: `${providerId}.runtime`,
    capabilities: ["travel.search_hotels"],
    actions: ["search", "reserve"],
    requiresConnectedAccount: false,
    authType: "none",
    riskLevel: "medium",
    runtimeConfig: {
      endpointUrl: "https://api.example.test/openapi.json",
      timeoutMs: 1000,
      maxResponseBytes: 4096,
      operations
    },
    description: "Imported OpenAPI runtime provider."
  });
  providerIds.push(providerId);
}

afterEach(() => {
  resetProviderRuntimeFetchForTest();
});

after(async () => {
  for (const providerId of providerIds) unregisterConnectorProvider(providerId);
  await prisma.providerReceipt.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.hitlRequest.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.toolRun.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
});

test("generic API runtime adapter executes search and normalizes option cards", async () => {
  const { user, agent } = await createUserAndAgent("api-search");
  const providerId = `${testRunId}-api-search`;
  registerApiProvider(providerId);
  let receivedMessage = "";
  setProviderRuntimeFetchForTest(async (_url, init) => {
    const receivedPayload = JSON.parse(String(init?.body ?? "{}")) as { input?: Record<string, unknown> };
    receivedMessage = String(receivedPayload.input?.message ?? "");
    return new Response(JSON.stringify({
      summary: "Found two stays near the center.",
      options: [
        { title: "Central Stay", price: "$140/night", url: "https://example.com/stay" },
        { title: "Quiet Hotel", description: "Breakfast included" }
      ],
      requestId: "api-search-1"
    }), { status: 200 });
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: providerId,
    input: hotelInput
  });

  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("Expected provider success.");
  assert.equal(receivedMessage, "Find hotels in Lisbon");
  assert.equal(result.result.items.length, 2);
  assert.equal(result.result.items[0]?.title, "Central Stay");
  assert.equal(result.result.receipt.endpointHost, "provider.example.test");
});

test("generic API runtime returns B2C-safe blocked output for provider failures", async () => {
  const { user, agent } = await createUserAndAgent("api-failure");
  const providerId = `${testRunId}-api-failure`;
  registerApiProvider(providerId);
  setProviderRuntimeFetchForTest(async () =>
    new Response(JSON.stringify({ message: "database stack trace: secret" }), { status: 503 })
  );

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: providerId,
    input: hotelInput
  });

  assert.equal(result.status, "blocked");
  if (result.status !== "blocked") throw new Error("Expected provider block.");
  assert.equal(result.code, "provider_unavailable");
  assert.match(result.userMessage ?? "", /temporarily unavailable/i);
  assert.doesNotMatch(result.userMessage ?? "", /stack trace|secret/i);
});

test("generic API runtime injects stored API key credentials and redacts them from results", async () => {
  const { user, agent } = await createUserAndAgent("api-auth");
  const providerId = `${testRunId}-api-auth`;
  registerConnectorProvider({
    providerId,
    label: "Credentialed runtime API",
    kind: "api",
    toolName: `${providerId}.runtime`,
    capabilities: ["travel.search_hotels"],
    actions: ["search"],
    requiresConnectedAccount: true,
    credentialType: "api_key",
    credentialFields: [{ key: "apiKey", label: "API key", type: "password", required: true }],
    authType: "api_key",
    riskLevel: "medium",
    runtimeConfig: {
      endpointUrl: "https://provider.example.test/runtime",
      authHeaderName: "x-api-key",
      authCredentialKey: "apiKey"
    },
    description: "Credentialed direct API runtime provider."
  });
  providerIds.push(providerId);
  await createProviderConnection({
    userId: user.id,
    providerId,
    credentials: { apiKey: "secret-api-key" }
  });
  let authHeader = "";
  setProviderRuntimeFetchForTest(async (_url, init) => {
    authHeader = String(new Headers(init?.headers).get("x-api-key") ?? "");
    return new Response(JSON.stringify({ summary: "Credentialed search completed." }), { status: 200 });
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: providerId,
    input: hotelInput
  });

  assert.equal(result.status, "ok");
  assert.equal(authHeader, "secret-api-key");
  assert.doesNotMatch(JSON.stringify(result), /secret-api-key/);
});

test("OpenAPI runtime injects stored bearer token credentials", async () => {
  const { user, agent } = await createUserAndAgent("openapi-auth");
  const providerId = `${testRunId}-openapi-auth`;
  registerConnectorProvider({
    providerId,
    label: "Credentialed OpenAPI provider",
    kind: "openapi",
    toolName: `${providerId}.runtime`,
    capabilities: ["travel.search_hotels"],
    actions: ["search"],
    requiresConnectedAccount: true,
    credentialType: "bearer_token",
    credentialFields: [{ key: "bearerToken", label: "Bearer token", type: "password", required: true }],
    authType: "api_key",
    riskLevel: "medium",
    runtimeConfig: {
      endpointUrl: "https://api.example.test/openapi.json",
      operations: [{
        operationId: "searchHotels",
        path: "/hotels/search",
        method: "GET",
        capabilityKey: "travel.search_hotels",
        action: "search"
      }]
    },
    description: "Credentialed OpenAPI runtime provider."
  });
  providerIds.push(providerId);
  await createProviderConnection({
    userId: user.id,
    providerId,
    credentials: { bearerToken: "openapi-token" }
  });
  let authorization = "";
  setProviderRuntimeFetchForTest(async (_url, init) => {
    authorization = String(new Headers(init?.headers).get("authorization") ?? "");
    return new Response(JSON.stringify({ items: [{ title: "Token Hotel" }] }), { status: 200 });
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: providerId,
    input: hotelInput
  });

  assert.equal(result.status, "ok");
  assert.equal(authorization, "Bearer openapi-token");
  assert.doesNotMatch(JSON.stringify(result), /openapi-token/);
});

test("MCP runtime adapter executes declared tools/call and normalizes options", async () => {
  const { user, agent } = await createUserAndAgent("mcp-search");
  const providerId = `${testRunId}-mcp-search`;
  registerMcpProvider(providerId);
  let method = "";
  let toolName = "";
  setProviderRuntimeFetchForTest(async (_url, init) => {
    const payload = JSON.parse(String(init?.body ?? "{}")) as {
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    method = payload.method ?? "";
    toolName = payload.params?.name ?? "";
    assert.equal(payload.params?.arguments?.destination, "Lisbon");
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: payload.params?.name,
      result: {
        content: [{
          type: "text",
          text: JSON.stringify({
            summary: "Found hotels from MCP.",
            options: [{ title: "MCP Central", price: "$120/night" }],
            requestId: "mcp-1"
          })
        }]
      }
    }), { status: 200 });
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: providerId,
    input: hotelInput
  });

  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("Expected MCP provider success.");
  assert.equal(method, "tools/call");
  assert.equal(toolName, "searchHotels");
  assert.equal(result.result.items[0]?.title, "MCP Central");
  assert.equal(result.result.receipt.endpointHost, "mcp.example.test");
});

test("MCP runtime blocks before network when no declared tool matches", async () => {
  const { user, agent } = await createUserAndAgent("mcp-no-tool");
  const providerId = `${testRunId}-mcp-no-tool`;
  registerMcpProvider(providerId, []);
  let calls = 0;
  setProviderRuntimeFetchForTest(async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: providerId,
    input: hotelInput
  });

  assert.equal(result.status, "blocked");
  assert.equal(calls, 0);
  if (result.status !== "blocked") throw new Error("Expected MCP mapping block.");
  assert.match(result.userMessage ?? "", /does not expose a matching MCP tool/i);
});

test("OpenAPI runtime adapter executes only a declared operation", async () => {
  const { user, agent } = await createUserAndAgent("openapi-search");
  const providerId = `${testRunId}-openapi-search`;
  registerOpenApiProvider(providerId);
  let calledUrl = "";
  let calledMethod = "";
  setProviderRuntimeFetchForTest(async (url, init) => {
    const requestUrl = new URL(String(url));
    calledUrl = requestUrl.toString();
    calledMethod = String(init?.method ?? "");
    assert.equal(requestUrl.pathname, "/hotels/search");
    assert.equal(requestUrl.searchParams.get("destination"), "Lisbon");
    return new Response(JSON.stringify({
      summary: "Found hotels from OpenAPI.",
      items: [{ title: "OpenAPI Hotel", price: "$130/night" }],
      requestId: "openapi-1"
    }), { status: 200 });
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: providerId,
    input: hotelInput
  });

  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("Expected OpenAPI provider success.");
  assert.equal(calledMethod, "GET");
  assert.match(calledUrl, /api\.example\.test\/hotels\/search/);
  assert.equal(result.result.items[0]?.title, "OpenAPI Hotel");
});

test("OpenAPI runtime blocks before network when no declared operation matches", async () => {
  const { user, agent } = await createUserAndAgent("openapi-no-operation");
  const providerId = `${testRunId}-openapi-no-operation`;
  registerOpenApiProvider(providerId, []);
  let calls = 0;
  setProviderRuntimeFetchForTest(async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: providerId,
    input: hotelInput
  });

  assert.equal(result.status, "blocked");
  assert.equal(calls, 0);
  if (result.status !== "blocked") throw new Error("Expected OpenAPI mapping block.");
  assert.match(result.userMessage ?? "", /does not expose a matching OpenAPI action/i);
});

test("high-risk reserve action pauses before the generic API runtime is called", async () => {
  const { user, agent } = await createUserAndAgent("api-reserve");
  const providerId = `${testRunId}-api-reserve`;
  registerApiProvider(providerId);
  let calls = 0;
  setProviderRuntimeFetchForTest(async () => {
    calls += 1;
    throw new Error("Reserve should require approval before provider execution.");
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    action: "reserve",
    preferredProviderId: providerId,
    input: bookingInput
  });

  assert.equal(result.status, "awaiting_human_approval");
  assert.equal(calls, 0);
});

test("manual provider kind returns a clean placeholder instead of raw runtime errors", async () => {
  const { user, agent } = await createUserAndAgent("manual-provider");
  const providerId = `${testRunId}-manual`;
  registerConnectorProvider({
    providerId,
    label: "Manual concierge",
    kind: "manual",
    toolName: `${providerId}.runtime`,
    capabilities: ["general.research"],
    actions: ["search"],
    requiresConnectedAccount: false,
    authType: "none",
    riskLevel: "low",
    description: "Manual handoff provider."
  });
  providerIds.push(providerId);

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "general.research",
    preferredProviderId: providerId,
    input: { message: "Find a niche provider" }
  });

  assert.equal(result.status, "blocked");
  if (result.status !== "blocked") throw new Error("Expected manual placeholder block.");
  assert.equal(result.code, "adapter_not_implemented");
  assert.match(result.userMessage ?? "", /manual handoff/i);
});

test("one generic API runtime provider can power travel, finance, and research capabilities", async () => {
  const { user, agent } = await createUserAndAgent("cross-domain");
  const providerId = `${testRunId}-cross-domain`;
  registerApiProvider(providerId, ["travel.search_hotels", "finance.review_spending", "general.research"]);
  const capabilities: string[] = [];
  setProviderRuntimeFetchForTest(async (_url, init) => {
    const payload = JSON.parse(String(init?.body ?? "{}")) as { capabilityKey?: string };
    capabilities.push(String(payload.capabilityKey));
    return new Response(JSON.stringify({
      summary: `Handled ${payload.capabilityKey}`,
      results: [{ title: `Result for ${payload.capabilityKey}` }]
    }), { status: 200 });
  });

  for (const capabilityKey of ["travel.search_hotels", "finance.review_spending", "general.research"]) {
    const result = await executeConnector({
      userId: user.id,
      agentId: agent.id,
      capabilityKey,
      preferredProviderId: providerId,
      input: capabilityKey === "travel.search_hotels"
        ? { ...hotelInput, message: `Run ${capabilityKey}` }
        : capabilityKey === "finance.review_spending"
          ? { ...financeInput, message: `Run ${capabilityKey}` }
          : { message: `Run ${capabilityKey}` }
    });
    assert.equal(result.status, "ok");
  }

  assert.deepEqual(capabilities, ["travel.search_hotels", "finance.review_spending", "general.research"]);
});
