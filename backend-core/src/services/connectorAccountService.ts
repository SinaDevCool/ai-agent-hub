import { env } from "../config/env.js";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";
import {
  decryptConnectorToken,
  encryptConnectorToken,
  sha256
} from "./cryptoService.js";
import { encodeJson, decodeJson } from "./jsonService.js";
import { writeActivityLog } from "./activityLogService.js";

const supportedProviders = new Set(["google", "microsoft", "travel", "email", "calendar", "jobs", "finance"]);

const googleScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.metadata.readonly"
];
const microsoftScopes = ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite", "Files.Read"];

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

type FetchLike = typeof fetch;
let connectorFetch: FetchLike = fetch;
export function setConnectorFetchForTest(value: FetchLike) { connectorFetch = value; }
export function resetConnectorFetchForTest() { connectorFetch = fetch; }

const oauthLifetimeMs = 15 * 60_000;
const refreshLeaseMs = 2 * 60_000;

function createPkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function createOAuthAuthorization(input: { userId: string; provider: "google" | "microsoft"; scopes: string[] }) {
  const state = randomBytes(32).toString("base64url");
  const pkce = createPkcePair();
  await prisma.oAuthAuthorization.create({
    data: {
      userId: input.userId,
      provider: input.provider,
      stateHash: sha256(state),
      encryptedCodeVerifier: encryptConnectorToken(pkce.verifier),
      requestedScopes: encodeJson(input.scopes),
      expiresAt: new Date(Date.now() + oauthLifetimeMs)
    }
  });
  return { state, codeChallenge: pkce.challenge };
}

async function consumeOAuthAuthorization(state: string, provider: "google" | "microsoft") {
  const stateHash = sha256(state);
  return prisma.$transaction(async (tx) => {
    const authorization = await tx.oAuthAuthorization.findUnique({ where: { stateHash } });
    if (!authorization || authorization.provider !== provider || authorization.consumedAt || authorization.expiresAt.getTime() <= Date.now()) {
      throw httpError(400, `This ${provider === "google" ? "Google" : "Microsoft"} connection link is invalid, expired, or already used.`, "invalid_connector_state");
    }
    const claimed = await tx.oAuthAuthorization.updateMany({
      where: { id: authorization.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() }
    });
    if (claimed.count !== 1) throw httpError(400, "This connection link has already been used.", "invalid_connector_state");
    return authorization;
  });
}

export function isSupportedConnectorProvider(provider: string) {
  return supportedProviders.has(provider);
}

function getGoogleRedirectUri() {
  const apiBase = env.API_PUBLIC_URL ?? env.APP_PUBLIC_URL;
  return env.GOOGLE_REDIRECT_URI ?? (apiBase ? `${apiBase.replace(/\/$/, "")}/api/connectors/google/callback` : "");
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

function getMicrosoftRedirectUri() {
  const apiBase = env.API_PUBLIC_URL ?? env.APP_PUBLIC_URL;
  return env.MICROSOFT_REDIRECT_URI ?? (apiBase ? `${apiBase.replace(/\/$/, "")}/api/connectors/microsoft/callback` : "");
}

function getMicrosoftConfigState() {
  const redirectUri = getMicrosoftRedirectUri();
  return { configured: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && redirectUri), redirectUri, missing: [!env.MICROSOFT_CLIENT_ID ? "MICROSOFT_CLIENT_ID" : "", !env.MICROSOFT_CLIENT_SECRET ? "MICROSOFT_CLIENT_SECRET" : "", !redirectUri ? "MICROSOFT_REDIRECT_URI or APP_PUBLIC_URL" : ""].filter(Boolean) };
}

function serializeAccount(account: {
  id: string;
  provider: string;
  accountLabel: string;
  scopes: string;
  expiresAt: Date | null;
  status: string;
  lastError: string | null;
  refreshStartedAt: Date | null;
  lastRefreshAt: Date | null;
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
    refreshStartedAt: account.refreshStartedAt,
    lastRefreshAt: account.lastRefreshAt,
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
  const account = await prisma.connectedAccount.findFirst({ where: { id: input.accountId, userId: input.userId } });
  if (!account) return false;
  let providerRevocation: "completed" | "not_supported" | "failed" = "not_supported";
  if (account.provider === "google" && (account.encryptedRefreshToken || account.encryptedAccessToken)) {
    const token = decryptConnectorToken(account.encryptedRefreshToken ?? account.encryptedAccessToken!);
    try {
      const response = await connectorFetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" }
      });
      providerRevocation = response.ok ? "completed" : "failed";
    } catch {
      providerRevocation = "failed";
    }
  }
  const result = await prisma.connectedAccount.updateMany({
    where: { id: input.accountId, userId: input.userId },
    data: { status: "revoked", encryptedAccessToken: null, encryptedRefreshToken: null, refreshStartedAt: null }
  });
  await writeActivityLog({
    userId: input.userId,
    actionType: "api_callback",
    status: providerRevocation === "failed" ? "error" : "success",
    dynamicMetadata: { action: "connector_revoked", provider: account.provider, accountId: account.id, providerRevocation }
  });
  return result.count > 0;
}

export async function getConnectorStartState(provider: string, userId?: string) {
  if (!isSupportedConnectorProvider(provider)) {
    return {
      status: "unsupported" as const,
      provider,
      authorizationUrl: null,
      message: "This connector provider is not supported yet."
    };
  }
  if (provider === "microsoft") {
    const config = getMicrosoftConfigState();
    if (!config.configured || !userId) return { status: "not_configured" as const, provider, authorizationUrl: null, missing: config.missing, message: "Microsoft OAuth is not configured yet." };
    const authorization = await createOAuthAuthorization({ userId, provider: "microsoft", scopes: microsoftScopes });
    const tenant = encodeURIComponent(env.MICROSOFT_TENANT_ID);
    const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
    url.searchParams.set("client_id", String(env.MICROSOFT_CLIENT_ID)); url.searchParams.set("redirect_uri", config.redirectUri); url.searchParams.set("response_type", "code"); url.searchParams.set("response_mode", "query"); url.searchParams.set("scope", microsoftScopes.join(" ")); url.searchParams.set("state", authorization.state); url.searchParams.set("code_challenge", authorization.codeChallenge); url.searchParams.set("code_challenge_method", "S256");
    return { status: "ready" as const, provider, authorizationUrl: url.toString(), scopes: microsoftScopes, message: "Open Microsoft to connect Outlook, Calendar, and OneDrive." };
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
  const authorization = await createOAuthAuthorization({ userId, provider: "google", scopes: googleScopes });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", String(env.GOOGLE_CLIENT_ID));
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", googleScopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", authorization.state);
  url.searchParams.set("code_challenge", authorization.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return {
    status: "ready" as const,
    provider,
    authorizationUrl: url.toString(),
    scopes: googleScopes,
    message: "Open Google to connect Gmail and Calendar."
  };
}

async function fetchMicrosoftToken(body: URLSearchParams) {
  const tenant = encodeURIComponent(env.MICROSOFT_TENANT_ID);
  const response = await connectorFetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const token = await response.json().catch(() => ({})) as GoogleTokenResponse;
  if (!response.ok || token.error || !token.access_token) throw httpError(502, token.error_description ?? "Microsoft could not complete account connection.", "microsoft_oauth_failed");
  return token;
}

export async function completeMicrosoftOAuth(input: { code: string; state: string }) {
  const authorization = await consumeOAuthAuthorization(input.state, "microsoft"); const config = getMicrosoftConfigState();
  if (!config.configured) throw httpError(500, "Microsoft OAuth is not configured.", "microsoft_oauth_not_configured");
  const token = await fetchMicrosoftToken(new URLSearchParams({ code: input.code, client_id: String(env.MICROSOFT_CLIENT_ID), client_secret: String(env.MICROSOFT_CLIENT_SECRET), redirect_uri: config.redirectUri, grant_type: "authorization_code", scope: decodeJson<string[]>(authorization.requestedScopes, microsoftScopes).join(" "), code_verifier: decryptConnectorToken(authorization.encryptedCodeVerifier) }));
  const profileResponse = await connectorFetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", { headers: { authorization: `Bearer ${token.access_token}` } });
  const profile = await profileResponse.json().catch(() => ({})) as { displayName?: string; mail?: string; userPrincipalName?: string };
  const accountLabel = profile.mail ?? profile.userPrincipalName ?? profile.displayName ?? "Microsoft account";
  const scopes = token.scope?.split(" ").filter(Boolean) ?? microsoftScopes;
  const account = await prisma.connectedAccount.upsert({ where: { userId_provider_accountLabel: { userId: authorization.userId, provider: "microsoft", accountLabel } }, update: { status: "active", scopes: encodeJson(scopes), encryptedAccessToken: encryptConnectorToken(String(token.access_token)), encryptedRefreshToken: token.refresh_token ? encryptConnectorToken(token.refresh_token) : undefined, expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null, refreshStartedAt: null, lastRefreshAt: new Date(), lastError: null }, create: { userId: authorization.userId, provider: "microsoft", accountLabel, status: "active", scopes: encodeJson(scopes), encryptedAccessToken: encryptConnectorToken(String(token.access_token)), encryptedRefreshToken: token.refresh_token ? encryptConnectorToken(token.refresh_token) : null, expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null, lastRefreshAt: new Date() } });
  return serializeAccount(account);
}

export async function getValidMicrosoftConnectorToken(input: { userId: string; requiredScopes?: string[] }) {
  const account = await prisma.connectedAccount.findFirst({ where: { userId: input.userId, provider: "microsoft", status: { in: ["active", "refreshing"] } }, orderBy: { updatedAt: "desc" } });
  if (!account?.encryptedAccessToken) return { status: "missing" as const, message: "Connect Microsoft before this agent can use Outlook, Calendar, or OneDrive." };
  const scopes = decodeJson<string[]>(account.scopes, []); const missingScopes = (input.requiredScopes ?? []).filter((scope) => !scopes.includes(scope));
  if (missingScopes.length) return { status: "missing_scope" as const, message: "Reconnect Microsoft and allow the requested access.", missingScopes };
  if (!account.expiresAt || account.expiresAt.getTime() > Date.now() + 60_000) return { status: "ok" as const, accessToken: decryptConnectorToken(account.encryptedAccessToken), account };
  if (!account.encryptedRefreshToken) return { status: "expired" as const, message: "Reconnect Microsoft before this agent can continue." };
  const leaseCutoff = new Date(Date.now() - refreshLeaseMs);
  const claimed = await prisma.connectedAccount.updateMany({
    where: { id: account.id, OR: [{ status: "active" }, { status: "refreshing", refreshStartedAt: { lt: leaseCutoff } }] },
    data: { status: "refreshing", refreshStartedAt: new Date() }
  });
  if (claimed.count !== 1) return { status: "refreshing" as const, message: "Microsoft access is being refreshed. Please retry shortly." };
  try {
    const token = await fetchMicrosoftToken(new URLSearchParams({ client_id: String(env.MICROSOFT_CLIENT_ID), client_secret: String(env.MICROSOFT_CLIENT_SECRET), refresh_token: decryptConnectorToken(account.encryptedRefreshToken), grant_type: "refresh_token", scope: microsoftScopes.join(" ") }));
    const accessToken = String(token.access_token); const updated = await prisma.connectedAccount.update({ where: { id: account.id }, data: { encryptedAccessToken: encryptConnectorToken(accessToken), encryptedRefreshToken: token.refresh_token ? encryptConnectorToken(token.refresh_token) : undefined, expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null, status: "active", refreshStartedAt: null, lastRefreshAt: new Date(), lastError: null } });
    return { status: "ok" as const, accessToken, account: updated };
  } catch (error) { const message = error instanceof Error ? error.message : "Microsoft token refresh failed."; await prisma.connectedAccount.update({ where: { id: account.id }, data: { status: "error", refreshStartedAt: null, lastError: message } }); return { status: "error" as const, message: "Reconnect Microsoft before this agent can continue." }; }
}

async function fetchGoogleToken(body: URLSearchParams) {
  const response = await connectorFetch("https://oauth2.googleapis.com/token", {
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
  const response = await connectorFetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return {};
  return response.json().catch(() => ({})) as Promise<GoogleUserInfo>;
}

export async function completeGoogleOAuth(input: { code: string; state: string }) {
  const authorization = await consumeOAuthAuthorization(input.state, "google");
  const config = getGoogleConfigState();
  if (!config.configured) {
    throw httpError(500, "Google OAuth is not configured.", "google_oauth_not_configured");
  }
  const token = await fetchGoogleToken(new URLSearchParams({
    code: input.code,
    client_id: String(env.GOOGLE_CLIENT_ID),
    client_secret: String(env.GOOGLE_CLIENT_SECRET),
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code_verifier: decryptConnectorToken(authorization.encryptedCodeVerifier)
  }));
  const accessToken = token.access_token;
  if (!accessToken) throw httpError(502, "Google did not return an access token.", "google_oauth_failed");
  const profile = await fetchGoogleUserInfo(accessToken);
  const scopes = token.scope?.split(" ").filter(Boolean) ?? googleScopes;
  const accountLabel = profile.email ?? "Google account";
  const account = await prisma.connectedAccount.upsert({
    where: {
      userId_provider_accountLabel: {
        userId: authorization.userId,
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
      refreshStartedAt: null,
      lastRefreshAt: new Date(),
      lastError: null
    },
    create: {
      userId: authorization.userId,
      provider: "google",
      accountLabel,
      status: "active",
      scopes: encodeJson(scopes),
      encryptedAccessToken: encryptConnectorToken(accessToken),
      encryptedRefreshToken: token.refresh_token ? encryptConnectorToken(token.refresh_token) : null,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null
      ,lastRefreshAt: new Date()
    }
  });
  return serializeAccount(account);
}

export async function getValidConnectorToken(input: { userId: string; provider: "google"; requiredScopes?: string[] }) {
  const account = await prisma.connectedAccount.findFirst({
    where: { userId: input.userId, provider: input.provider, status: { in: ["active", "refreshing"] } },
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
  const leaseCutoff = new Date(Date.now() - refreshLeaseMs);
  const claimed = await prisma.connectedAccount.updateMany({
    where: { id: account.id, OR: [{ status: "active" }, { status: "refreshing", refreshStartedAt: { lt: leaseCutoff } }] },
    data: { status: "refreshing", refreshStartedAt: new Date() }
  });
  if (claimed.count !== 1) return { status: "refreshing" as const, message: "Google access is being refreshed. Please retry shortly." };
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
        refreshStartedAt: null,
        lastRefreshAt: new Date(),
        lastError: null
      }
    });
    return { status: "ok" as const, accessToken, account: updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google token refresh failed.";
    await prisma.connectedAccount.update({ where: { id: account.id }, data: { status: "error", refreshStartedAt: null, lastError: message } });
    return { status: "error" as const, message: "Reconnect Google before this agent can continue." };
  }
}
