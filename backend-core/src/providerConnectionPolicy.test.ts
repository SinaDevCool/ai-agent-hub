import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildProviderAuthHeaders,
  isProviderConnectionUsable,
  providerConnectionBlockDetails,
  providerNeedsConnection
} from "./services/providerConnectionPolicyService.js";
import type { ProviderAdapter } from "./services/providers/providerAdapterTypes.js";

function provider(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    providerId: "policy-provider",
    label: "Policy Provider",
    kind: "api",
    toolName: "policy.provider.run",
    capabilities: ["general.research"],
    actions: ["search"],
    requiresConnectedAccount: false,
    credentialType: "none",
    authType: "none",
    riskLevel: "medium",
    description: "Provider policy test provider.",
    supportsHealthCheck: false,
    canHandle: () => true,
    async execute() {
      return { status: "ok", toolRunId: "policy-tool-run", result: {} };
    },
    ...overrides
  };
}

test("providerNeedsConnection is true only for account-backed auth modes", () => {
  assert.equal(providerNeedsConnection(provider()), false);
  assert.equal(providerNeedsConnection(provider({ authType: "workflow_secret" })), false);
  assert.equal(providerNeedsConnection(provider({ requiresConnectedAccount: true })), true);
  assert.equal(providerNeedsConnection(provider({ authType: "api_key" })), true);
  assert.equal(providerNeedsConnection(provider({ authType: "oauth" })), true);
});

test("buildProviderAuthHeaders builds API key, bearer, OAuth, and custom auth headers", () => {
  const apiKey = buildProviderAuthHeaders({
    provider: provider({ credentialType: "api_key", authType: "api_key" }),
    credentials: { apiKey: "secret-key" },
    providerConnection: { status: "active" }
  });
  assert.equal(apiKey.ok, true);
  if (apiKey.ok) assert.equal(apiKey.headers["x-api-key"], "secret-key");

  const bearer = buildProviderAuthHeaders({
    provider: provider({ credentialType: "bearer_token", authType: "connected_account" }),
    credentials: { bearerToken: "secret-token" },
    providerConnection: { status: "active" }
  });
  assert.equal(bearer.ok, true);
  if (bearer.ok) assert.equal(bearer.headers.authorization, "Bearer secret-token");

  const oauth = buildProviderAuthHeaders({
    provider: provider({ credentialType: "oauth", authType: "oauth" }),
    credentials: { accessToken: "oauth-token" },
    providerConnection: { status: "active" }
  });
  assert.equal(oauth.ok, true);
  if (oauth.ok) assert.equal(oauth.headers.authorization, "Bearer oauth-token");

  const custom = buildProviderAuthHeaders({
    provider: provider({ credentialType: "api_key", authType: "api_key", runtimeConfig: { authHeaderName: "x-custom-key", authCredentialKey: "customKey" } }),
    credentials: { customKey: "custom-secret" },
    providerConnection: { status: "active" }
  });
  assert.equal(custom.ok, true);
  if (custom.ok) assert.equal(custom.headers["x-custom-key"], "custom-secret");
});

test("buildProviderAuthHeaders returns consistent block details for missing setup", () => {
  const missingConnection = buildProviderAuthHeaders({
    provider: provider({ requiresConnectedAccount: true, credentialType: "api_key", authType: "api_key" }),
    credentials: { apiKey: "secret-key" }
  });
  assert.equal(missingConnection.ok, false);
  if (!missingConnection.ok) {
    assert.equal(missingConnection.details.code, "connector_not_connected");
    assert.equal(missingConnection.details.nextAction, "connect_account");
  }

  const incompleteCustomAuth = buildProviderAuthHeaders({
    provider: provider({ runtimeConfig: { authHeaderName: "x-custom-key" } })
  });
  assert.equal(incompleteCustomAuth.ok, false);
  if (!incompleteCustomAuth.ok) {
    assert.equal(incompleteCustomAuth.details.code, "provider_error");
    assert.equal(incompleteCustomAuth.details.nextAction, "fix_workflow");
  }
});

test("provider connection block details normalize reconnect and disabled states", () => {
  assert.equal(isProviderConnectionUsable({ status: "active" }), true);
  assert.equal(isProviderConnectionUsable({ status: "reconnect_required" }), false);

  const reconnect = providerConnectionBlockDetails({
    provider: provider(),
    connection: { id: "conn-1", status: "reconnect_required" }
  });
  assert.equal(reconnect.code, "connector_expired");
  assert.equal(reconnect.nextAction, "connect_account");

  const disabled = providerConnectionBlockDetails({
    provider: provider(),
    connection: { id: "conn-2", status: "disabled" }
  });
  assert.equal(disabled.code, "provider_unavailable");
  assert.equal(disabled.nextAction, "fix_workflow");
  assert.equal(disabled.retryable, false);
  assert.match(disabled.userMessage, /turned off/i);
});
