import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { prisma } from "./db/prisma.js";
import { createVaultSalt } from "./services/cryptoService.js";
import { encodeJson } from "./services/jsonService.js";
import { executeConnector } from "./services/connectorExecutionService.js";
import {
  loadActiveProviderDefinitionsIntoRegistry
} from "./services/providerDefinitionService.js";
import { resolveConnectorProvider, unregisterConnectorProvider } from "./services/connectorProviderRegistryService.js";
import {
  resetProviderRuntimeFetchForTest,
  setProviderRuntimeFetchForTest
} from "./services/providers/providerRuntimeAdapterService.js";
import {
  resetProviderHealthFetchForTest,
  setProviderHealthFetchForTest
} from "./services/providerHealthService.js";

const testRunId = `provider-definitions-${Date.now()}`;
let server: Server;
let baseUrl = "";

const hotelInput = {
  message: "Find hotels",
  destination: "Lisbon",
  checkInDate: "2026-08-12",
  checkOutDate: "2026-08-16",
  guests: 2
};

async function createUser(suffix: string, role: "user" | "admin" = "user") {
  return prisma.user.create({
    data: {
      id: `${testRunId}-${suffix}`,
      email: `${testRunId}-${suffix}@example.test`,
      role,
      vaultLocalPath: "test-vault",
      vaultEncryptionSalt: createVaultSalt()
    }
  });
}

async function createAgent(suffix: string) {
  return prisma.agent.create({
    data: {
      name: `${testRunId}-${suffix}-agent`,
      category: "Custom",
      apiProtocol: "MCP",
      trustScore: 82,
      capabilityManifest: encodeJson({
        protocol: "MCP",
        tools: ["provider.definition"],
        requestedSchemas: [],
        highRiskActions: [],
        description: "Provider definition test agent."
      })
    }
  });
}

async function api(path: string, userId: string, init?: RequestInit) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
      ...(init?.headers ?? {})
    }
  });
}

function providerPayload(providerId: string, endpointUrl = "https://provider.example.test/runtime") {
  return {
    providerId,
    label: "DB API Provider",
    kind: "api",
    toolName: `${providerId}.runtime`,
    capabilities: ["travel.search_hotels"],
    actions: ["search"],
    runtimeConfig: { endpointUrl, timeoutMs: 1000 },
    authType: "none",
    riskLevel: "medium",
    requiresConnectedAccount: false,
    supportsHealthCheck: false,
    status: "active",
    description: "Provider persisted in DB."
  };
}

function healthProviderPayload(providerId: string) {
  return {
    ...providerPayload(providerId, "https://provider.example.test/runtime"),
    runtimeConfig: {
      endpointUrl: "https://provider.example.test/runtime",
      healthEndpointUrl: "https://provider.example.test/health",
      timeoutMs: 1000
    },
    supportsHealthCheck: true
  };
}

function credentialProviderPayload(providerId: string) {
  return {
    ...providerPayload(providerId, "https://provider.example.test/runtime"),
    runtimeConfig: {
      endpointUrl: "https://provider.example.test/runtime",
      timeoutMs: 1000,
      authHeaderName: "authorization",
      authCredentialKey: "apiKey"
    },
    credentialType: "api_key",
    credentialFields: [{
      key: "apiKey",
      label: "API key",
      type: "password",
      required: true,
      helpText: "Used only by the backend provider runtime."
    }]
  };
}

before(() => {
  server = createApp().listen(0);
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  resetProviderRuntimeFetchForTest();
  resetProviderHealthFetchForTest();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  const definitions = await prisma.providerDefinition.findMany({ where: { providerId: { startsWith: testRunId } } });
  for (const definition of definitions) unregisterConnectorProvider(definition.providerId);
  await prisma.providerReceipt.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.toolRun.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.providerConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.providerDefinition.deleteMany({ where: { providerId: { startsWith: testRunId } } });
  await prisma.providerConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
});

test("admin can create an active DB-backed API provider that appears in discovery and executes", async () => {
  const admin = await createUser("admin-create", "admin");
  const user = await createUser("owner");
  const agent = await createAgent("owner");
  await prisma.userConnection.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      connectionStatus: "active",
      tokenExpiresAt: new Date(Date.now() + 60_000)
    }
  });
  const providerId = `${testRunId}-db-api`;
  const createResponse = await api("/api/admin/providers", admin.id, {
    method: "POST",
    body: JSON.stringify(providerPayload(providerId))
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json() as { provider: { providerId: string; runtimeConfig: Record<string, unknown> } };
  assert.equal(created.provider.providerId, providerId);
  assert.equal(created.provider.runtimeConfig.endpointUrl, "https://provider.example.test/runtime");

  const discoveryResponse = await api("/api/connectors/providers", user.id);
  const discovery = await discoveryResponse.json() as { providers: Array<{ providerId: string }> };
  assert.ok(discovery.providers.some((provider) => provider.providerId === providerId));

  setProviderRuntimeFetchForTest(async () => new Response(JSON.stringify({
    summary: "Found one DB-backed stay.",
    options: [{ title: "DB Stay", price: "$120" }]
  }), { status: 200 }));
  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: providerId,
    input: hotelInput
  });
  assert.equal(result.status, "ok");
  if (result.status !== "ok") throw new Error("Expected provider success.");
  assert.equal(result.result.items[0]?.title, "DB Stay");
});

test("disabled DB provider is removed from execution candidates", async () => {
  const admin = await createUser("admin-disable", "admin");
  const user = await createUser("disable-owner");
  const agent = await createAgent("disable-owner");
  await prisma.userConnection.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      connectionStatus: "active",
      tokenExpiresAt: new Date(Date.now() + 60_000)
    }
  });
  const providerId = `${testRunId}-disable`;
  const createResponse = await api("/api/admin/providers", admin.id, {
    method: "POST",
    body: JSON.stringify(providerPayload(providerId))
  });
  const created = await createResponse.json() as { provider: { id: string } };
  assert.ok(resolveConnectorProvider({ capabilityKey: "travel.search_hotels", preferredProviderId: providerId }));

  const disableResponse = await api(`/api/admin/providers/${created.provider.id}/disable`, admin.id, { method: "POST" });
  assert.equal(disableResponse.status, 200);
  assert.equal(resolveConnectorProvider({ capabilityKey: "travel.search_hotels", preferredProviderId: providerId }), null);

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: providerId,
    input: hotelInput
  });
  assert.equal(result.status, "blocked");
  if (result.status !== "blocked") throw new Error("Expected missing provider block.");
  assert.match(result.userMessage ?? "", /No connected provider/i);
});

test("provider admin API rejects invalid capabilities and secret-looking runtime config", async () => {
  const admin = await createUser("admin-invalid", "admin");
  const invalidCapability = await api("/api/admin/providers", admin.id, {
    method: "POST",
    body: JSON.stringify({
      ...providerPayload(`${testRunId}-invalid-capability`),
      capabilities: ["travel.unknown"]
    })
  });
  assert.equal(invalidCapability.status, 400);

  const secretConfig = await api("/api/admin/providers", admin.id, {
    method: "POST",
    body: JSON.stringify({
      ...providerPayload(`${testRunId}-secret-config`),
      runtimeConfig: {
        endpointUrl: "https://provider.example.test/runtime",
        authorization: "Bearer secret"
      }
    })
  });
  assert.equal(secretConfig.status, 400);
});

test("provider definitions persist normalized action contracts from aliases and defaults", async () => {
  const admin = await createUser("admin-contract-normalized", "admin");
  const providerId = `${testRunId}-normalized-contract`;
  const createResponse = await api("/api/admin/providers", admin.id, {
    method: "POST",
    body: JSON.stringify({
      ...providerPayload(providerId),
      capabilities: ["travel.hotel.search", "travel.search_hotels"],
      actions: ["search", "search"],
      actionSchemas: [{
        capabilityKey: "travel.hotel.search",
        action: "search",
        riskLevel: "medium",
        requiresApproval: false,
        inputSchema: {
          destination: { type: "string", description: "<b>Destination</b>" },
          apiKey: { type: "string", description: "Should stay a normal input field, not a secret value." }
        },
        requiredFields: ["destination", "missingField"],
        examples: [{ destination: "<script>alert(1)</script>Lisbon" }],
        userPrompt: "<b>Where should this provider search?</b>",
        missingInputMessage: "<b>Add a destination.</b>",
        allowExtraFields: true
      }]
    })
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json() as {
    provider: {
      capabilities: string[];
      actions: string[];
      actionSchemas: Array<{ capabilityKey: string; action: string; requiredFields: string[]; userPrompt: string; examples: Array<Record<string, unknown>> }>;
    };
  };
  assert.deepEqual(created.provider.capabilities, ["travel.search_hotels"]);
  assert.deepEqual(created.provider.actions, ["search"]);
  assert.equal(created.provider.actionSchemas.length, 1);
  assert.equal(created.provider.actionSchemas[0]?.capabilityKey, "travel.search_hotels");
  assert.deepEqual(created.provider.actionSchemas[0]?.requiredFields, ["destination"]);
  assert.equal(created.provider.actionSchemas[0]?.userPrompt, "Where should this provider search?");
  assert.equal(created.provider.actionSchemas[0]?.examples[0]?.destination, "Lisbon");
});

test("provider definitions persist default action schemas for undeclared actions", async () => {
  const admin = await createUser("admin-default-contract", "admin");
  const providerId = `${testRunId}-default-contract`;
  const createResponse = await api("/api/admin/providers", admin.id, {
    method: "POST",
    body: JSON.stringify({
      ...providerPayload(providerId),
      capabilities: ["travel.search_hotels"],
      actions: ["search", "reserve"],
      actionSchemas: []
    })
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json() as {
    provider: { actionSchemas: Array<{ capabilityKey: string; action: string; requiresApproval: boolean; riskLevel: string; requiredFields: string[] }> };
  };
  const reserveSchema = created.provider.actionSchemas.find((schema) => schema.action === "reserve");
  assert.ok(reserveSchema);
  assert.equal(reserveSchema?.capabilityKey, "travel.search_hotels");
  assert.equal(reserveSchema?.requiresApproval, true);
  assert.equal(reserveSchema?.riskLevel, "high");
  assert.deepEqual(reserveSchema?.requiredFields, ["selectedOptionId", "maxApprovedTotal", "cancellationRuleAcknowledged"]);
});

test("provider admin route requires moderator access", async () => {
  const user = await createUser("not-admin", "user");
  const response = await api("/api/admin/providers", user.id);
  assert.equal(response.status, 403);
});

test("startup loader skips invalid persisted providers without registering them", async () => {
  const providerId = `${testRunId}-invalid-loader`;
  await prisma.providerDefinition.create({
    data: {
      providerId,
      label: "Invalid loader provider",
      kind: "api",
      toolName: `${providerId}.runtime`,
      capabilitiesJson: encodeJson(["missing.capability"]),
      actionsJson: encodeJson(["search"]),
      runtimeConfigJson: encodeJson({ endpointUrl: "https://provider.example.test/runtime" }),
      authType: "none",
      riskLevel: "medium",
      requiresConnectedAccount: false,
      supportsHealthCheck: false,
      status: "active"
    }
  });
  await loadActiveProviderDefinitionsIntoRegistry();
  assert.equal(resolveConnectorProvider({ capabilityKey: "general.research", preferredProviderId: providerId }), null);
});

test("admin can check persisted provider health and discovery exposes readiness", async () => {
  const admin = await createUser("admin-health", "admin");
  const user = await createUser("health-owner");
  const providerId = `${testRunId}-health-ready`;
  const createResponse = await api("/api/admin/providers", admin.id, {
    method: "POST",
    body: JSON.stringify(healthProviderPayload(providerId))
  });
  assert.equal(createResponse.status, 201);

  let healthCalls = 0;
  setProviderHealthFetchForTest(async () => {
    healthCalls += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  const healthResponse = await api(`/api/admin/providers/${providerId}/health/check`, admin.id, { method: "POST" });
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json() as { health: { readiness: string; state: string } };
  assert.equal(health.health.readiness, "ready");
  assert.equal(health.health.state, "healthy");
  assert.equal(healthCalls, 1);

  const discoveryResponse = await api("/api/connectors/providers", user.id);
  const discovery = await discoveryResponse.json() as { providers: Array<{ providerId: string; health: Array<{ readiness: string }> }> };
  const provider = discovery.providers.find((item) => item.providerId === providerId);
  assert.equal(provider?.health[0]?.readiness, "ready");
});

test("unhealthy persisted provider is blocked before runtime execution", async () => {
  const admin = await createUser("admin-unhealthy", "admin");
  const user = await createUser("unhealthy-owner");
  const agent = await createAgent("unhealthy-owner");
  await prisma.userConnection.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      connectionStatus: "active",
      tokenExpiresAt: new Date(Date.now() + 60_000)
    }
  });
  const providerId = `${testRunId}-health-failing`;
  const createResponse = await api("/api/admin/providers", admin.id, {
    method: "POST",
    body: JSON.stringify(healthProviderPayload(providerId))
  });
  assert.equal(createResponse.status, 201);

  let runtimeCalls = 0;
  setProviderHealthFetchForTest(async () => new Response(JSON.stringify({ ok: false }), { status: 503 }));
  setProviderRuntimeFetchForTest(async () => {
    runtimeCalls += 1;
    return new Response(JSON.stringify({ summary: "Should not run." }), { status: 200 });
  });

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: providerId,
    input: hotelInput
  });
  assert.equal(result.status, "blocked");
  if (result.status !== "blocked") throw new Error("Expected provider to be blocked.");
  assert.match(result.userMessage ?? "", /temporarily unavailable/i);
  assert.equal(runtimeCalls, 0);
});

test("provider requiring credentials blocks with a B2C-safe connection message", async () => {
  const admin = await createUser("admin-credentials", "admin");
  const user = await createUser("credentials-owner");
  const agent = await createAgent("credentials-owner");
  await prisma.userConnection.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      connectionStatus: "active",
      tokenExpiresAt: new Date(Date.now() + 60_000)
    }
  });
  const providerId = `${testRunId}-needs-credentials`;
  const createResponse = await api("/api/admin/providers", admin.id, {
    method: "POST",
    body: JSON.stringify({
      ...providerPayload(providerId),
      authType: "api_key",
      requiresConnectedAccount: true
    })
  });
  assert.equal(createResponse.status, 201);

  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "travel.search_hotels",
    preferredProviderId: providerId,
    input: hotelInput
  });
  assert.equal(result.status, "blocked");
  if (result.status !== "blocked") throw new Error("Expected provider to be blocked.");
  assert.match(result.userMessage ?? "", /Connect DB API Provider/i);
  assert.equal(result.nextAction, "connect_account");
});

test("persisted credential contract injects runtime header without leaking secrets", async () => {
  const admin = await createUser("admin-runtime-credential", "admin");
  const user = await createUser("runtime-credential-owner");
  const agent = await createAgent("runtime-credential-owner");
  await prisma.userConnection.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      connectionStatus: "active",
      tokenExpiresAt: new Date(Date.now() + 60_000)
    }
  });
  const providerId = `${testRunId}-credential-runtime`;
  const createResponse = await api("/api/admin/providers", admin.id, {
    method: "POST",
    body: JSON.stringify(credentialProviderPayload(providerId))
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json() as { provider: { credentialFields: Array<{ key: string }>; runtimeConfig: Record<string, unknown> } };
  assert.equal(created.provider.credentialFields[0]?.key, "apiKey");
  assert.equal(created.provider.runtimeConfig.authCredentialKey, "apiKey");

  const connectionResponse = await api("/api/provider-connections", user.id, {
    method: "POST",
    body: JSON.stringify({
      providerId,
      credentials: { apiKey: "super-secret-runtime-key" }
    })
  });
  assert.equal(connectionResponse.status, 201);

  setProviderRuntimeFetchForTest(async (_url, init) => {
    assert.equal((init?.headers as Record<string, string>).authorization, "super-secret-runtime-key");
    return new Response(JSON.stringify({
      summary: "Credentialed search worked.",
      options: [{ title: "Private result" }]
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

  const receipts = await prisma.providerReceipt.findMany({ where: { userId: user.id, providerId } });
  const toolRuns = await prisma.toolRun.findMany({ where: { userId: user.id, toolName: `${providerId}.runtime` } });
  assert.doesNotMatch(JSON.stringify(receipts), /super-secret-runtime-key/);
  assert.doesNotMatch(JSON.stringify(toolRuns), /super-secret-runtime-key/);
});
