import { env } from "../config/env.js";
import { randomUUID } from "node:crypto";
import { badRequest, unauthorized } from "../errors/httpError.js";
import { signConnectorState, verifyConnectorState } from "./cryptoService.js";
import { listConnectorProviders } from "./connectorProviderRegistryService.js";
import { createProviderConnection } from "./providerConnectionService.js";
import {
  providerOAuthFetch,
  resetProviderOAuthFetchForTest,
  setProviderOAuthFetchForTest
} from "./providerOAuthFetchService.js";
import type { ProviderOAuthConfig } from "./providers/providerAdapterTypes.js";
import { sha256 } from "./cryptoService.js";

export { resetProviderOAuthFetchForTest, setProviderOAuthFetchForTest };

const consumedOAuthStates = new Map<string, number>();

function consumeOAuthState(state: string, expiresAt: number) {
  const now = Date.now();
  for (const [key, expiry] of consumedOAuthStates) if (expiry <= now) consumedOAuthStates.delete(key);
  const fingerprint = sha256(state);
  if (consumedOAuthStates.has(fingerprint)) return false;
  consumedOAuthStates.set(fingerprint, expiresAt);
  return true;
}

function publicBaseUrl() {
  return env.API_PUBLIC_URL ?? env.APP_PUBLIC_URL ?? "http://localhost:4141";
}

function callbackUrl(redirectPath = "/api/provider-connections/oauth/callback") {
  return new URL(redirectPath, publicBaseUrl()).toString();
}

type ReadyOAuthConfig = ProviderOAuthConfig & {
  authUrl: string;
  tokenUrl: string;
  clientIdEnvKey: string;
  clientSecretEnvKey: string;
};

function providerForOAuth(providerId: string) {
  const provider = listConnectorProviders().find((item) => item.providerId === providerId);
  if (!provider) throw badRequest("Choose a registered provider.", "unknown_provider");
  if ((provider.credentialType ?? provider.authType) !== "oauth" && provider.authType !== "oauth") {
    throw badRequest("This provider does not support OAuth connections.", "provider_oauth_not_supported");
  }
  const config = provider.oauthConfig ?? {};
  if (!config.authUrl || !config.tokenUrl || !config.clientIdEnvKey || !config.clientSecretEnvKey) {
    throw badRequest("This OAuth provider is not fully configured.", "invalid_oauth_config");
  }
  return { provider, config: config as ReadyOAuthConfig };
}

export function startProviderOAuth(input: { userId: string; providerId: string }) {
  const { provider, config } = providerForOAuth(input.providerId);
  const clientId = process.env[config.clientIdEnvKey!];
  if (!clientId) throw badRequest("This OAuth provider is missing its client id configuration.", "invalid_oauth_config");
  const redirectUri = callbackUrl(config.redirectPath);
  const state = signConnectorState({
    type: "provider_oauth",
    providerId: provider.providerId,
    userId: input.userId,
    nonce: randomUUID(),
    createdAt: new Date().toISOString()
  });
  const url = new URL(config.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  for (const scope of config.scopes ?? []) url.searchParams.append("scope", scope);
  return {
    status: "ready" as const,
    providerId: provider.providerId,
    authorizationUrl: url.toString(),
    state,
    redirectUri
  };
}

export async function completeProviderOAuth(input: { code?: string; state?: string }) {
  if (!input.code || !input.state) throw badRequest("OAuth callback is incomplete.", "oauth_callback_incomplete");
  const state = verifyConnectorState<{
    type?: string;
    providerId?: string;
    userId?: string;
    createdAt?: string;
  }>(input.state);
  const createdAt = state?.createdAt ? Date.parse(state.createdAt) : Number.NaN;
  if (!state || state.type !== "provider_oauth" || !state.providerId || !state.userId
    || !Number.isFinite(createdAt) || Date.now() - createdAt > 15 * 60_000 || createdAt > Date.now() + 60_000) {
    throw unauthorized("OAuth state is invalid or expired.", "invalid_oauth_state");
  }
  if (!consumeOAuthState(input.state, createdAt + 15 * 60_000)) {
    throw unauthorized("OAuth state has already been used.", "invalid_oauth_state");
  }
  const { provider, config } = providerForOAuth(state.providerId);
  const clientId = process.env[config.clientIdEnvKey!];
  const clientSecret = process.env[config.clientSecretEnvKey!];
  if (!clientId || !clientSecret) throw badRequest("This OAuth provider is missing server credentials.", "invalid_oauth_config");
  const redirectUri = callbackUrl(config.redirectPath);
  const response = await providerOAuthFetch(config.tokenUrl!, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== "string") {
    throw badRequest("This provider rejected the OAuth connection.", "oauth_token_exchange_failed");
  }
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : undefined;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;
  const connection = await createProviderConnection({
    userId: state.userId,
    providerId: provider.providerId,
    displayName: typeof body.account_label === "string" ? body.account_label : provider.label,
    credentials: {
      accessToken: body.access_token,
      refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : undefined
    },
    scopes: typeof body.scope === "string" ? body.scope.split(/\s+/).filter(Boolean) : config.scopes,
    expiresAt,
    refreshAfter: expiresAt ? new Date(expiresAt.getTime() - 5 * 60_000) : undefined,
    externalAccountId: typeof body.account_id === "string" ? body.account_id : undefined,
    externalAccountLabel: typeof body.account_label === "string" ? body.account_label : undefined,
    metadata: { oauth: true }
  });
  return { status: "connected" as const, connection };
}
