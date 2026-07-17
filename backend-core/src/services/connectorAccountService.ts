import { env } from "../config/env.js";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";
import {
  decryptConnectorToken,
  encryptConnectorToken,
  signConnectorState,
  verifyConnectorState
} from "./cryptoService.js";
import { encodeJson, decodeJson } from "./jsonService.js";

const supportedProviders = new Set(["google", "travel", "email", "calendar", "jobs", "finance"]);

const googleScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.readonly"
];

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email?: string;
  name?: string;
};

type ConnectorState = {
  userId: string;
  provider: string;
  nonce: string;
  createdAt: number;
};

export function isSupportedConnectorProvider(provider: string) {
  return supportedProviders.has(provider);
}

function getGoogleRedirectUri() {
  return env.GOOGLE_REDIRECT_URI ?? (env.APP_PUBLIC_URL ? `${env.APP_PUBLIC_URL.replace(/\/$/, "")}/api/connectors/google/callback` : "");
}

function getGoogleConfigState() {
  const redirectUri = getGoogleRedirectUri();
  const configured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && redirectUri);
  return {
    configured,
    redirectUri,
    missing: [
      !env.GOOGLE_CLIENT_ID ? "GOOGLE_CLIENT_ID" : "",
      !env.GOOGLE_CLIENT_SECRET ? "GOOGLE_CLIENT_SECRET" : "",
      !redirectUri ? "GOOGLE_REDIRECT_URI or APP_PUBLIC_URL" : ""
    ].filter(Boolean)
  };
}

function serializeAccount(account: {
  id: string;
  provider: string;
  accountLabel: string;
  scopes: string;
  expiresAt: Date | null;
  status: string;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: account.id,
    provider: account.provider,
    accountLabel: account.accountLabel,
    scopes: decodeJson<string[]>(account.scopes, []),
    expiresAt: account.expiresAt,
    status: account.status,
    lastError: account.lastError,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

export async function listConnectedAccounts(userId: string) {
  const accounts = await prisma.connectedAccount.findMany({
    where: { userId },
    orderBy: [{ provider: "asc" }, { createdAt: "desc" }]
  });
  return accounts.map(serializeAccount);
}

export async function disconnectConnectedAccount(input: { userId: string; accountId: string }) {
  const result = await prisma.connectedAccount.updateMany({
    where: { id: input.accountId, userId: input.userId },
    data: { status: "revoked", encryptedAccessToken: null, encryptedRefreshToken: null }
  });
  return result.count > 0;
}

export function getConnectorStartState(provider: string, userId?: string) {
  if (!isSupportedConnectorProvider(provider)) {
    return {
      status: "unsupported" as const,
      provider,
      authorizationUrl: null,
      message: "This connector provider is not supported yet."
    };
  }
  if (provider !== "google") {
    return {
      status: "not_configured" as const,
      provider,
      authorizationUrl: null,
      message: "This connector is registered, but its provider OAuth adapter is not implemented yet."
    };
  }
  const config = getGoogleConfigState();
  if (!config.configured || !userId) {
    return {
      status: "not_configured" as const,
      provider,
      authorizationUrl: null,
      missing: config.missing,
      message: "Google OAuth is not configured yet."
    };
  }
  const state = signConnectorState({
    userId,
    provider,
    nonce: randomUUID(),
    createdAt: Date.now()
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", String(env.GOOGLE_CLIENT_ID));
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", googleScopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return {
    status: "ready" as const,
    provider,
    authorizationUrl: url.toString(),
    scopes: googleScopes,
    message: "Open Google to connect Gmail and Calendar."
  };
}

async function fetchGoogleToken(body: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const token = await response.json().catch(() => ({})) as GoogleTokenResponse;
  if (!response.ok || token.error || !token.access_token) {
    throw httpError(502, token.error_description ?? "Google could not complete account connection.", "google_oauth_failed");
  }
  return token;
}

async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return {};
  return response.json().catch(() => ({})) as Promise<GoogleUserInfo>;
}

export async function completeGoogleOAuth(input: { code: string; state: string }) {
  const state = verifyConnectorState<ConnectorState>(input.state);
  const config = getGoogleConfigState();
  if (!state || state.provider !== "google" || !state.userId || Date.now() - state.createdAt > 15 * 60_000) {
    throw httpError(400, "This Google connection link is invalid or expired.", "invalid_connector_state");
  }
  if (!config.configured) {
    throw httpError(500, "Google OAuth is not configured.", "google_oauth_not_configured");
  }
  const token = await fetchGoogleToken(new URLSearchParams({
    code: input.code,
    client_id: String(env.GOOGLE_CLIENT_ID),
    client_secret: String(env.GOOGLE_CLIENT_SECRET),
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code"
  }));
  const accessToken = token.access_token;
  if (!accessToken) throw httpError(502, "Google did not return an access token.", "google_oauth_failed");
  const profile = await fetchGoogleUserInfo(accessToken);
  const scopes = token.scope?.split(" ").filter(Boolean) ?? googleScopes;
  const accountLabel = profile.email ?? "Google account";
  const account = await prisma.connectedAccount.upsert({
    where: {
      userId_provider_accountLabel: {
        userId: state.userId,
        provider: "google",
        accountLabel
      }
    },
    update: {
      status: "active",
      scopes: encodeJson(scopes),
      encryptedAccessToken: encryptConnectorToken(accessToken),
      encryptedRefreshToken: token.refresh_token ? encryptConnectorToken(token.refresh_token) : undefined,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      lastError: null
    },
    create: {
      userId: state.userId,
      provider: "google",
      accountLabel,
      status: "active",
      scopes: encodeJson(scopes),
      encryptedAccessToken: encryptConnectorToken(accessToken),
      encryptedRefreshToken: token.refresh_token ? encryptConnectorToken(token.refresh_token) : null,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null
    }
  });
  return serializeAccount(account);
}

export async function getValidConnectorToken(input: { userId: string; provider: "google"; requiredScopes?: string[] }) {
  const account = await prisma.connectedAccount.findFirst({
    where: { userId: input.userId, provider: input.provider, status: "active" },
    orderBy: { updatedAt: "desc" }
  });
  if (!account || !account.encryptedAccessToken) {
    return { status: "missing" as const, message: "Connect Google before this agent can use email or calendar." };
  }
  const scopes = decodeJson<string[]>(account.scopes, []);
  const missingScopes = (input.requiredScopes ?? []).filter((scope) => !scopes.includes(scope));
  if (missingScopes.length) {
    return { status: "missing_scope" as const, message: "Reconnect Google and allow the requested email/calendar access.", missingScopes };
  }
  if (!account.expiresAt || account.expiresAt.getTime() > Date.now() + 60_000) {
    return { status: "ok" as const, accessToken: decryptConnectorToken(account.encryptedAccessToken), account };
  }
  if (!account.encryptedRefreshToken) {
    await prisma.connectedAccount.update({ where: { id: account.id }, data: { status: "expired", lastError: "Missing refresh token." } });
    return { status: "expired" as const, message: "Reconnect Google before this agent can continue." };
  }
  try {
    const token = await fetchGoogleToken(new URLSearchParams({
      client_id: String(env.GOOGLE_CLIENT_ID),
      client_secret: String(env.GOOGLE_CLIENT_SECRET),
      refresh_token: decryptConnectorToken(account.encryptedRefreshToken),
      grant_type: "refresh_token"
    }));
    const accessToken = token.access_token;
    if (!accessToken) throw new Error("Google did not return a refreshed access token.");
    const updated = await prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        encryptedAccessToken: encryptConnectorToken(accessToken),
        expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
        status: "active",
        lastError: null
      }
    });
    return { status: "ok" as const, accessToken, account: updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google token refresh failed.";
    await prisma.connectedAccount.update({ where: { id: account.id }, data: { status: "error", lastError: message } });
    return { status: "error" as const, message: "Reconnect Google before this agent can continue." };
  }
}
