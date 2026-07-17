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
import { resetProviderOAuthFetchForTest, setProviderOAuthFetchForTest } from "./services/providerOAuthService.js";
import {
  resetProviderConnectionTestFetchForTest,
  setProviderConnectionTestFetchForTest
} from "./services/providerConnectionService.js";

const testRunId = `provider-connections-${Date.now()}`;
const providerId = `${testRunId}-api-provider`;
const oauthProviderId = `${testRunId}-oauth-provider`;
let server: Server;
let baseUrl = "";

const financeInput = {
  message: "Review spending",
  accountSource: "main card",
  startDate: "2026-07-01",
  endDate: "2026-07-31"
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
      trustScore: 88,
      capabilityManifest: encodeJson({
        protocol: "MCP",
        tools: ["provider.execute"],
        requestedSchemas: [],
        highRiskActions: [],
        description: "Provider connection test agent."
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

before(() => {
  server = createApp().listen(0);
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  const adapter: ProviderAdapter = {
    providerId,
    label: "Credentialed API Provider",
    kind: "api",
    toolName: "credentialed.provider.execute",
    capabilities: ["finance.review_spending"],
    actions: ["search"],
    requiresConnectedAccount: true,
    credentialType: "api_key",
    credentialFields: [{ key: "apiKey", label: "API key", type: "password", required: true }],
    oauthConfig: {},
    authType: "api_key",
    riskLevel: "medium",
    supportsHealthCheck: true,
    runtimeConfig: {
      healthEndpointUrl: "https://api.example.test/health",
      authHeaderName: "x-api-key",
      authCredentialKey: "apiKey"
    },
    description: "Provider that requires user credentials.",
    canHandle(input) {
      if (input.preferredProviderId && input.preferredProviderId !== providerId) return false;
      return input.capabilityKey === "finance.review_spending" && input.action === "search";
    },
    async execute(input) {
      if (input.providerConnection?.credentials.apiKey !== "secret-api-key") {
        return {
          status: "blocked",
          toolRunId: `${testRunId}-blocked-${input.attempt}`,
          reason: "Provider credentials were not supplied.",
          code: "connector_not_connected",
          userMessage: "Connect this provider before using it.",
          nextAction: "connect_account",
          retryable: true
        };
      }
      return {
        status: "ok",
        toolRunId: `${testRunId}-ok-${input.attempt}`,
        result: {
          reply: "Provider used the encrypted credential.",
          externalRequestId: "connection-execution-1",
          endpointHost: "api.example.test"
        }
      };
    }
  };
  registerProviderAdapter(adapter);
  registerProviderAdapter({
    providerId: oauthProviderId,
    label: "OAuth Provider",
    kind: "api",
    toolName: "oauth.provider.execute",
    capabilities: ["general.research"],
    actions: ["search"],
    requiresConnectedAccount: true,
    credentialType: "oauth",
    credentialFields: [],
    oauthConfig: {
      authUrl: "https://oauth.example.test/authorize",
      tokenUrl: "https://oauth.example.test/token",
      scopes: ["search.read"],
      clientIdEnvKey: `${testRunId}_CLIENT_ID`,
      clientSecretEnvKey: `${testRunId}_CLIENT_SECRET`,
      redirectPath: "/api/provider-connections/oauth/callback"
    },
    authType: "oauth",
    riskLevel: "medium",
    supportsHealthCheck: false,
    description: "Provider that connects with OAuth.",
    canHandle(input) {
      if (input.preferredProviderId && input.preferredProviderId !== oauthProviderId) return false;
      return input.capabilityKey === "general.research" && input.action === "search";
    },
    async execute(input) {
      if (input.providerConnection?.credentials.accessToken !== "oauth-refreshed-token") {
        return {
          status: "blocked",
          toolRunId: `${testRunId}-oauth-blocked-${input.attempt}`,
          reason: "Provider account needs to be refreshed.",
          code: "connector_expired",
          userMessage: "Reconnect OAuth Provider before this agent can continue.",
          nextAction: "connect_account",
          retryable: true
        };
      }
      return { status: "ok", toolRunId: `${testRunId}-oauth-ok`, result: { reply: "OAuth provider ran." } };
    }
  });
  process.env[`${testRunId}_CLIENT_ID`] = "oauth-client-id";
  process.env[`${testRunId}_CLIENT_SECRET`] = "oauth-client-secret";
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  unregisterConnectorProvider(providerId);
  unregisterConnectorProvider(oauthProviderId);
  resetProviderOAuthFetchForTest();
  resetProviderConnectionTestFetchForTest();
  await prisma.providerReceipt.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.providerConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agent.deleteMany({ where: { name: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

test("provider connection API rejects missing required credential fields", async () => {
  const { user } = await createUserAndAgent("missing-required");
  const response = await api("/api/provider-connections", user.id, {
    method: "POST",
    body: JSON.stringify({
      providerId,
      displayName: "Incomplete API key",
      credentials: { otherValue: "not enough" }
    })
  });
  assert.equal(response.status, 400);
  const body = await response.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, "missing_provider_credentials");
  assert.match(body.error.message, /apiKey/);
});

test("provider connection API stores encrypted credentials and never returns secrets", async () => {
  const { user } = await createUserAndAgent("create");
  const createResponse = await api("/api/provider-connections", user.id, {
    method: "POST",
    body: JSON.stringify({
      providerId,
      displayName: "My API key",
      credentials: { apiKey: "secret-api-key" },
      metadata: { note: "safe", tokenLabel: "should be stripped" }
    })
  });
  assert.equal(createResponse.status, 201);
  const createBody = await createResponse.json() as { connection: Record<string, unknown> };
  assert.equal(createBody.connection.providerId, providerId);
  assert.equal(createBody.connection.displayName, "My API key");
  assert.doesNotMatch(JSON.stringify(createBody), /secret-api-key|encryptedCredentials/i);

  const stored = await prisma.providerConnection.findFirstOrThrow({ where: { userId: user.id, providerId } });
  assert.notEqual(stored.encryptedCredentials, "secret-api-key");
  assert.doesNotMatch(stored.encryptedCredentials, /secret-api-key/);
  assert.ok(stored.credentialFingerprint);

  const listResponse = await api("/api/provider-connections", user.id);
  const listBody = await listResponse.json() as { connections: Array<Record<string, unknown>> };
  assert.equal(listBody.connections.length, 1);
  assert.doesNotMatch(JSON.stringify(listBody), /secret-api-key|encryptedCredentials/i);
});

test("execution is blocked without an active provider connection and succeeds with one", async () => {
  const { user, agent } = await createUserAndAgent("gate");
  const blocked = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "finance.review_spending",
    preferredProviderId: providerId,
    input: financeInput
  });
  assert.equal(blocked.status, "blocked");
  if (blocked.status === "blocked") assert.equal(blocked.nextAction, "connect_account");

  await api("/api/provider-connections", user.id, {
    method: "POST",
    body: JSON.stringify({ providerId, credentials: { apiKey: "secret-api-key" } })
  });
  const ok = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "finance.review_spending",
    preferredProviderId: providerId,
    input: financeInput
  });
  assert.equal(ok.status, "ok");
});

test("disabled provider connection blocks execution and discovery reports connection status", async () => {
  const { user, agent } = await createUserAndAgent("disabled");
  const createResponse = await api("/api/provider-connections", user.id, {
    method: "POST",
    body: JSON.stringify({ providerId, credentials: { apiKey: "secret-api-key" } })
  });
  const createBody = await createResponse.json() as { connection: { id: string } };
  await api(`/api/provider-connections/${createBody.connection.id}`, user.id, {
    method: "PATCH",
    body: JSON.stringify({ status: "disabled" })
  });

  const blocked = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "finance.review_spending",
    preferredProviderId: providerId,
    input: financeInput
  });
  assert.equal(blocked.status, "blocked");

  const discoveryResponse = await api("/api/connectors/providers", user.id);
  const discovery = await discoveryResponse.json() as { providers: Array<{ providerId: string; connectionStatus: string; connectedCount: number }> };
  const provider = discovery.providers.find((item) => item.providerId === providerId);
  assert.equal(provider?.connectionStatus, "disabled");
  assert.equal(provider?.connectedCount, 0);
});

test("provider connections are scoped to the owning user", async () => {
  const owner = await createUserAndAgent("owner");
  const outsider = await createUserAndAgent("outsider");
  await api("/api/provider-connections", owner.user.id, {
    method: "POST",
    body: JSON.stringify({ providerId, credentials: { apiKey: "secret-api-key" } })
  });

  const outsiderList = await api("/api/provider-connections", outsider.user.id);
  const outsiderBody = await outsiderList.json() as { connections: unknown[] };
  assert.equal(outsiderBody.connections.length, 0);

  const blocked = await executeConnector({
    userId: outsider.user.id,
    agentId: outsider.agent.id,
    capabilityKey: "finance.review_spending",
    preferredProviderId: providerId,
    input: financeInput
  });
  assert.equal(blocked.status, "blocked");
});

test("validation updates provider connection health fields", async () => {
  const { user } = await createUserAndAgent("validate");
  const createResponse = await api("/api/provider-connections", user.id, {
    method: "POST",
    body: JSON.stringify({ providerId, credentials: { apiKey: "secret-api-key" } })
  });
  const createBody = await createResponse.json() as { connection: { id: string } };
  const validateResponse = await api(`/api/provider-connections/${createBody.connection.id}/validate`, user.id, { method: "POST" });
  assert.equal(validateResponse.status, 200);
  const validateBody = await validateResponse.json() as { connection: { status: string; lastValidatedAt: string | null; lastSuccessAt: string | null } };
  assert.equal(validateBody.connection.status, "active");
  assert.ok(validateBody.connection.lastValidatedAt);
  assert.ok(validateBody.connection.lastSuccessAt);
});

test("provider connection test calls provider endpoint with stored credentials", async () => {
  const { user } = await createUserAndAgent("test-ready");
  const createResponse = await api("/api/provider-connections", user.id, {
    method: "POST",
    body: JSON.stringify({ providerId, credentials: { apiKey: "secret-api-key" } })
  });
  const createBody = await createResponse.json() as { connection: { id: string } };
  let authHeader = "";
  setProviderConnectionTestFetchForTest(async (url, init) => {
    assert.equal(String(url), "https://api.example.test/health");
    authHeader = String(new Headers(init?.headers).get("x-api-key") ?? "");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  const testResponse = await api(`/api/provider-connections/${createBody.connection.id}/test`, user.id, { method: "POST" });
  assert.equal(testResponse.status, 200);
  const body = await testResponse.json() as { connection: { status: string; lastSuccessAt: string | null }; test: { status: string; message: string } };
  assert.equal(authHeader, "secret-api-key");
  assert.equal(body.connection.status, "active");
  assert.equal(body.test.status, "ready");
  assert.ok(body.connection.lastSuccessAt);
  assert.doesNotMatch(JSON.stringify(body), /secret-api-key|encryptedCredentials/i);
});

test("provider connection test marks rejected credentials as reconnect required", async () => {
  const { user } = await createUserAndAgent("test-rejected");
  const createResponse = await api("/api/provider-connections", user.id, {
    method: "POST",
    body: JSON.stringify({ providerId, credentials: { apiKey: "secret-api-key" } })
  });
  const createBody = await createResponse.json() as { connection: { id: string } };
  setProviderConnectionTestFetchForTest(async () =>
    new Response(JSON.stringify({ error: "unauthorized secret-api-key" }), { status: 401 })
  );

  const testResponse = await api(`/api/provider-connections/${createBody.connection.id}/test`, user.id, { method: "POST" });
  const body = await testResponse.json() as { connection: { status: string; lastFailureReason: string | null }; test: { status: string; nextAction: string } };
  assert.equal(body.connection.status, "reconnect_required");
  assert.equal(body.test.status, "needs_setup");
  assert.equal(body.test.nextAction, "connect_account");
  assert.doesNotMatch(JSON.stringify(body), /secret-api-key|unauthorized secret/i);
});

test("expired provider connection validates as expired and blocks execution", async () => {
  const { user, agent } = await createUserAndAgent("expired");
  const createResponse = await api("/api/provider-connections", user.id, {
    method: "POST",
    body: JSON.stringify({
      providerId,
      credentials: { apiKey: "secret-api-key" },
      expiresAt: new Date(Date.now() - 60_000).toISOString()
    })
  });
  const createBody = await createResponse.json() as { connection: { id: string } };
  const validateResponse = await api(`/api/provider-connections/${createBody.connection.id}/validate`, user.id, { method: "POST" });
  const validateBody = await validateResponse.json() as { connection: { status: string; lastFailureReason: string | null } };
  assert.equal(validateBody.connection.status, "expired");
  assert.match(validateBody.connection.lastFailureReason ?? "", /expired/i);

  const blocked = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "finance.review_spending",
    preferredProviderId: providerId,
    input: financeInput
  });
  assert.equal(blocked.status, "blocked");
});

test("provider OAuth start and callback store encrypted tokens without returning secrets", async () => {
  const { user } = await createUserAndAgent("oauth");
  const startResponse = await api(`/api/provider-connections/${oauthProviderId}/oauth/start`, user.id, { method: "POST" });
  assert.equal(startResponse.status, 200);
  const startBody = await startResponse.json() as { authorizationUrl: string; state: string };
  const authUrl = new URL(startBody.authorizationUrl);
  assert.equal(authUrl.searchParams.get("client_id"), "oauth-client-id");
  assert.equal(authUrl.searchParams.get("state"), startBody.state);

  setProviderOAuthFetchForTest(async (_url, init) => {
    const body = init?.body?.toString() ?? "";
    assert.match(body, /client_secret=oauth-client-secret/);
    return new Response(JSON.stringify({
      access_token: "oauth-access-token",
      refresh_token: "oauth-refresh-token",
      expires_in: 3600,
      scope: "search.read",
      account_id: "acct-1",
      account_label: "OAuth Account"
    }), { status: 200 });
  });
  const callbackResponse = await fetch(`${baseUrl}/api/provider-connections/oauth/callback?code=test-code&state=${encodeURIComponent(startBody.state)}`);
  assert.equal(callbackResponse.status, 200);
  const callbackBody = await callbackResponse.json() as { connection: Record<string, unknown> };
  assert.equal(callbackBody.connection.providerId, oauthProviderId);
  assert.equal(callbackBody.connection.externalAccountId, "acct-1");
  assert.doesNotMatch(JSON.stringify(callbackBody), /oauth-access-token|oauth-refresh-token|encryptedCredentials/i);

  const stored = await prisma.providerConnection.findFirstOrThrow({ where: { userId: user.id, providerId: oauthProviderId } });
  assert.doesNotMatch(stored.encryptedCredentials, /oauth-access-token|oauth-refresh-token/);
  assert.equal(stored.externalAccountLabel, "OAuth Account");
});

test("manual provider refresh updates OAuth tokens without returning secrets", async () => {
  const { user } = await createUserAndAgent("manual-refresh");
  const createResponse = await api("/api/provider-connections", user.id, {
    method: "POST",
    body: JSON.stringify({
      providerId: oauthProviderId,
      credentials: { accessToken: "old-token", refreshToken: "refresh-token" },
      expiresAt: new Date(Date.now() - 60_000).toISOString()
    })
  });
  const createBody = await createResponse.json() as { connection: { id: string } };

  setProviderOAuthFetchForTest(async (_url, init) => {
    const body = init?.body?.toString() ?? "";
    assert.match(body, /grant_type=refresh_token/);
    assert.match(body, /refresh_token=refresh-token/);
    return new Response(JSON.stringify({
      access_token: "oauth-refreshed-token",
      refresh_token: "next-refresh-token",
      expires_in: 3600,
      scope: "search.read search.write"
    }), { status: 200 });
  });
  const refreshResponse = await api(`/api/provider-connections/${createBody.connection.id}/refresh`, user.id, { method: "POST" });
  assert.equal(refreshResponse.status, 200);
  const refreshBody = await refreshResponse.json() as { connection: Record<string, unknown> };
  assert.equal(refreshBody.connection.status, "active");
  assert.doesNotMatch(JSON.stringify(refreshBody), /oauth-refreshed-token|next-refresh-token|encryptedCredentials/i);

  const stored = await prisma.providerConnection.findFirstOrThrow({ where: { id: createBody.connection.id } });
  assert.equal(stored.status, "active");
  assert.ok(stored.expiresAt);
  assert.ok(stored.refreshAfter);
  assert.doesNotMatch(stored.encryptedCredentials, /oauth-refreshed-token|next-refresh-token/);
});

test("runtime refreshes an expired OAuth token before executing provider action", async () => {
  const { user, agent } = await createUserAndAgent("runtime-refresh");
  await api("/api/provider-connections", user.id, {
    method: "POST",
    body: JSON.stringify({
      providerId: oauthProviderId,
      credentials: { accessToken: "stale-token", refreshToken: "runtime-refresh-token" },
      expiresAt: new Date(Date.now() - 60_000).toISOString()
    })
  });
  setProviderOAuthFetchForTest(async (_url, init) => {
    const body = init?.body?.toString() ?? "";
    assert.match(body, /refresh_token=runtime-refresh-token/);
    return new Response(JSON.stringify({
      access_token: "oauth-refreshed-token",
      expires_in: 3600,
      scope: "search.read"
    }), { status: 200 });
  });
  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "general.research",
    preferredProviderId: oauthProviderId,
    input: { message: "Search with OAuth provider" }
  });
  assert.equal(result.status, "ok");

  const stored = await prisma.providerConnection.findFirstOrThrow({ where: { userId: user.id, providerId: oauthProviderId } });
  assert.equal(stored.status, "active");
  assert.doesNotMatch(stored.encryptedCredentials, /oauth-refreshed-token/);
});

test("missing refresh token marks OAuth connection as reconnect required", async () => {
  const { user, agent } = await createUserAndAgent("missing-refresh-token");
  await api("/api/provider-connections", user.id, {
    method: "POST",
    body: JSON.stringify({
      providerId: oauthProviderId,
      credentials: { accessToken: "stale-token" },
      expiresAt: new Date(Date.now() - 60_000).toISOString()
    })
  });
  const result = await executeConnector({
    userId: user.id,
    agentId: agent.id,
    capabilityKey: "general.research",
    preferredProviderId: oauthProviderId,
    input: { message: "Search with OAuth provider" }
  });
  assert.equal(result.status, "blocked");
  if (result.status === "blocked") {
    assert.equal(result.nextAction, "connect_account");
    assert.match(result.userMessage ?? "", /Reconnect OAuth Provider/);
  }
  const stored = await prisma.providerConnection.findFirstOrThrow({ where: { userId: user.id, providerId: oauthProviderId } });
  assert.equal(stored.status, "reconnect_required");
  assert.match(stored.lastFailureReason ?? "", /Reconnect OAuth Provider/);
});

test("manual provider refresh is scoped to the owning user", async () => {
  const owner = await createUserAndAgent("refresh-owner");
  const outsider = await createUserAndAgent("refresh-outsider");
  const createResponse = await api("/api/provider-connections", owner.user.id, {
    method: "POST",
    body: JSON.stringify({
      providerId: oauthProviderId,
      credentials: { accessToken: "old-token", refreshToken: "refresh-token" },
      expiresAt: new Date(Date.now() - 60_000).toISOString()
    })
  });
  const createBody = await createResponse.json() as { connection: { id: string } };
  const response = await api(`/api/provider-connections/${createBody.connection.id}/refresh`, outsider.user.id, { method: "POST" });
  assert.equal(response.status, 404);
});
