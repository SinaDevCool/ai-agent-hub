import type { ProviderConnection, ProviderConnectionStatus } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { badRequest, notFound } from "../errors/httpError.js";
import { decryptProviderCredentials, encryptProviderCredentials, fingerprintSecret } from "./cryptoService.js";
import { decodeJson, encodeJson } from "./jsonService.js";
import { listConnectorProviders } from "./connectorProviderRegistryService.js";
import { providerOAuthFetch } from "./providerOAuthFetchService.js";
import { buildProviderAuthHeaders } from "./providerConnectionPolicyService.js";
import type { ProviderAdapter, ProviderOAuthConfig } from "./providers/providerAdapterTypes.js";
import { validateExternalUrl } from "./policy/externalUrlPolicyService.js";
import { writeActivityLog } from "./activityLogService.js";

export type ProviderCredentials = Record<string, unknown>;

export type ProviderConnectionInput = {
  userId: string;
  providerId: string;
  displayName?: string;
  credentials: ProviderCredentials;
  scopes?: string[];
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
  refreshAfter?: Date;
  externalAccountId?: string;
  externalAccountLabel?: string;
};

export type ProviderConnectionUpdateInput = {
  userId: string;
  connectionId: string;
  displayName?: string;
  credentials?: ProviderCredentials;
  scopes?: string[];
  metadata?: Record<string, unknown>;
  status?: ProviderConnectionStatus;
  expiresAt?: Date;
  refreshAfter?: Date;
  externalAccountId?: string;
  externalAccountLabel?: string;
};

export type ProviderConnectionTestResult = {
  status: "ready" | "needs_setup" | "expired" | "unreachable" | "unsafe_endpoint";
  message: string;
  providerId: string;
  providerLabel: string;
  checkedAt: string;
  retryable: boolean;
  nextAction?: "connect_account" | "fix_workflow" | "try_again";
};

type FetchLike = typeof fetch;

let providerConnectionTestFetchImpl: FetchLike = fetch;

export function setProviderConnectionTestFetchForTest(nextFetch: FetchLike) {
  providerConnectionTestFetchImpl = nextFetch;
}

export function resetProviderConnectionTestFetchForTest() {
  providerConnectionTestFetchImpl = fetch;
}

function cleanText(value: string | undefined, fallback: string, maxLength: number) {
  return (value ?? fallback).replace(/\s+/g, " ").trim().slice(0, maxLength) || fallback;
}

function cleanCredentials(credentials: ProviderCredentials) {
  const safe: ProviderCredentials = {};
  for (const [key, value] of Object.entries(credentials)) {
    const cleanKey = key.trim().slice(0, 80);
    if (!cleanKey) continue;
    if (typeof value === "string") safe[cleanKey] = value.slice(0, 20_000);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) safe[cleanKey] = value;
  }
  if (!Object.keys(safe).length) throw badRequest("Add at least one credential value.", "missing_provider_credentials");
  return safe;
}

function requiredCredentialFields(provider: { credentialFields?: Array<{ key: string; required: boolean }> }) {
  return (provider.credentialFields ?? []).filter((field) => field.required).map((field) => field.key);
}

function missingCredentialFields(provider: { credentialFields?: Array<{ key: string; required: boolean }> }, credentials: ProviderCredentials) {
  return requiredCredentialFields(provider).filter((key) => {
    const value = credentials[key];
    return typeof value === "string" ? !value.trim() : value === undefined || value === null;
  });
}

function validateCredentialsForProvider(provider: { credentialFields?: Array<{ key: string; required: boolean }> }, credentials: ProviderCredentials) {
  const cleaned = cleanCredentials(credentials);
  const missing = missingCredentialFields(provider, cleaned);
  if (missing.length) {
    throw badRequest(`Add the required credential fields: ${missing.join(", ")}.`, "missing_provider_credentials");
  }
  return cleaned;
}

function safeMetadata(metadata: Record<string, unknown> | undefined) {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (/secret|token|password|authorization|cookie|key/i.test(key)) continue;
    if (typeof value === "string") safe[key.slice(0, 80)] = value.slice(0, 280);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) safe[key.slice(0, 80)] = value;
  }
  return safe;
}

function credentialPayload(credentials: ProviderCredentials) {
  return encodeJson(credentials);
}

function encryptedCredentials(credentials: ProviderCredentials, provider?: { credentialFields?: Array<{ key: string; required: boolean }> }) {
  const payload = credentialPayload(provider ? validateCredentialsForProvider(provider, credentials) : cleanCredentials(credentials));
  return {
    encrypted: encryptProviderCredentials(payload),
    fingerprint: fingerprintSecret(payload)
  };
}

function isReconnectStatus(status: ProviderConnectionStatus) {
  return status === "expired" || status === "revoked" || status === "reconnect_required";
}

function readyOAuthConfig(provider: ProviderAdapter | undefined): (ProviderOAuthConfig & {
  tokenUrl: string;
  clientIdEnvKey: string;
  clientSecretEnvKey: string;
}) | null {
  const config = provider?.oauthConfig ?? {};
  if (!config.tokenUrl || !config.clientIdEnvKey || !config.clientSecretEnvKey) return null;
  return config as ProviderOAuthConfig & { tokenUrl: string; clientIdEnvKey: string; clientSecretEnvKey: string };
}

function refreshFailureMessage(providerLabel: string) {
  return `Reconnect ${providerLabel} before this agent can continue.`;
}

function shouldRefreshConnection(input: { connection: ProviderConnection; provider?: ProviderAdapter; force?: boolean }) {
  const { connection, provider, force } = input;
  if ((provider?.credentialType ?? connection.authType) !== "oauth" && connection.authType !== "oauth") return false;
  if (connection.status === "disabled" || connection.status === "revoked") return false;
  if (force) return true;
  const now = Date.now();
  if (connection.expiresAt && connection.expiresAt.getTime() <= now) return true;
  if (connection.refreshAfter && connection.refreshAfter.getTime() <= now) return true;
  return false;
}

async function markReconnectRequired(input: { connection: ProviderConnection; providerLabel: string; reason?: string }) {
  return prisma.providerConnection.update({
    where: { id: input.connection.id },
    data: {
      status: "reconnect_required",
      lastValidatedAt: new Date(),
      lastFailureAt: new Date(),
      lastFailureReason: input.reason ?? refreshFailureMessage(input.providerLabel)
    }
  });
}

async function refreshOAuthConnection(input: {
  connection: ProviderConnection;
  provider?: ProviderAdapter;
  force?: boolean;
}): Promise<{ connection: ProviderConnection; credentials: ProviderCredentials }> {
  const { connection, provider, force } = input;
  const providerLabel = provider?.label ?? connection.providerId;
  const credentials = decodeJson<ProviderCredentials>(
    decryptProviderCredentials(connection.encryptedCredentials),
    {}
  );
  if (!shouldRefreshConnection({ connection, provider, force })) return { connection, credentials };
  const refreshToken = credentials.refreshToken;
  if (typeof refreshToken !== "string" || !refreshToken.trim()) {
    return {
      connection: await markReconnectRequired({
        connection,
        providerLabel,
        reason: `Reconnect ${providerLabel}. The saved account connection cannot be refreshed.`
      }),
      credentials
    };
  }
  const config = readyOAuthConfig(provider);
  const clientId = config ? process.env[config.clientIdEnvKey] : undefined;
  const clientSecret = config ? process.env[config.clientSecretEnvKey] : undefined;
  if (!config || !clientId || !clientSecret) {
    return {
      connection: await markReconnectRequired({
        connection,
        providerLabel,
        reason: `Reconnect ${providerLabel}. This provider is missing refresh configuration.`
      }),
      credentials
    };
  }

  await prisma.providerConnection.update({
    where: { id: connection.id },
    data: { status: "refreshing", lastValidatedAt: new Date(), lastFailureReason: null }
  });

  try {
    const response = await providerOAuthFetch(config.tokenUrl, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret
      })
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || typeof body.access_token !== "string") {
      return {
        connection: await markReconnectRequired({
          connection,
          providerLabel,
          reason: `Reconnect ${providerLabel}. The saved account connection expired.`
        }),
        credentials
      };
    }
    const nextCredentials = {
      ...credentials,
      accessToken: body.access_token,
      refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : refreshToken,
      grantedScopes: typeof body.scope === "string" ? body.scope : credentials.grantedScopes
    };
    const payload = encodeJson(nextCredentials);
    const expiresIn = typeof body.expires_in === "number" ? body.expires_in : undefined;
    const expiresAt = typeof body.expires_at === "number" ? new Date(body.expires_at * 1000) : expiresIn ? new Date(Date.now() + expiresIn * 1000) : connection.expiresAt;
    const scopes = typeof body.scope === "string"
      ? body.scope.split(/\s+/).filter(Boolean)
      : decodeJson<string[]>(connection.scopes, []);
    const refreshed = await prisma.providerConnection.update({
      where: { id: connection.id },
      data: {
        status: "active",
        encryptedCredentials: encryptProviderCredentials(payload),
        credentialFingerprint: fingerprintSecret(payload),
        scopes: encodeJson(scopes),
        expiresAt,
        refreshAfter: expiresAt ? new Date(expiresAt.getTime() - 5 * 60_000) : connection.refreshAfter,
        lastValidatedAt: new Date(),
        lastSuccessAt: new Date(),
        lastFailureReason: null
      }
    });
    return { connection: refreshed, credentials: nextCredentials };
  } catch {
    return {
      connection: await markReconnectRequired({
        connection,
        providerLabel,
        reason: `Reconnect ${providerLabel}. The provider could not refresh this account.`
      }),
      credentials
    };
  }
}

async function validateStoredConnection(input: {
  connection: ProviderConnection;
  provider?: ProviderAdapter;
  forceRefresh?: boolean;
}) {
  const refreshed = await refreshOAuthConnection({
    connection: input.connection,
    provider: input.provider,
    force: input.forceRefresh
  });
  const missing = missingCredentialFields(input.provider ?? {}, refreshed.credentials);
  const expired = Boolean(refreshed.connection.expiresAt && refreshed.connection.expiresAt.getTime() <= Date.now());
  if (isReconnectStatus(refreshed.connection.status)) {
    return { connection: refreshed.connection, credentials: refreshed.credentials, ok: false, missing, expired };
  }
  if (missing.length || expired) {
    const now = new Date();
    const updated = await prisma.providerConnection.update({
      where: { id: refreshed.connection.id },
      data: {
        status: expired ? "expired" : "error",
        lastValidatedAt: now,
        lastFailureAt: now,
        lastFailureReason: expired
          ? "Credentials are expired."
          : `Missing credential fields: ${missing.join(", ")}.`
      }
    });
    return { connection: updated, credentials: refreshed.credentials, ok: false, missing, expired };
  }
  return { ...refreshed, ok: refreshed.connection.status === "active", missing, expired };
}

export function serializeProviderConnection(connection: {
  id: string;
  providerId: string;
  providerKind: string;
  authType: string;
  status: ProviderConnectionStatus;
  displayName: string;
  credentialFingerprint: string;
  scopes: string;
  metadata: string;
  expiresAt: Date | null;
  refreshAfter: Date | null;
  externalAccountId: string | null;
  externalAccountLabel: string | null;
  lastValidatedAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: connection.id,
    providerId: connection.providerId,
    providerKind: connection.providerKind,
    authType: connection.authType,
    status: connection.status,
    displayName: connection.displayName,
    credentialFingerprint: connection.credentialFingerprint,
    expiresAt: connection.expiresAt?.toISOString() ?? null,
    refreshAfter: connection.refreshAfter?.toISOString() ?? null,
    externalAccountId: connection.externalAccountId,
    externalAccountLabel: connection.externalAccountLabel,
    scopes: decodeJson<string[]>(connection.scopes, []),
    metadata: decodeJson<Record<string, unknown>>(connection.metadata, {}),
    lastValidatedAt: connection.lastValidatedAt?.toISOString() ?? null,
    lastSuccessAt: connection.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: connection.lastFailureAt?.toISOString() ?? null,
    lastFailureReason: connection.lastFailureReason,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString()
  };
}

export async function createProviderConnection(input: ProviderConnectionInput) {
  const provider = listConnectorProviders().find((item) => item.providerId === input.providerId);
  if (!provider) throw badRequest("Choose a registered provider.", "unknown_provider");
  const credentials = encryptedCredentials(input.credentials, provider);
  const connection = await prisma.providerConnection.create({
    data: {
      userId: input.userId,
      providerId: provider.providerId,
      providerKind: provider.kind,
      authType: provider.authType,
      displayName: cleanText(input.displayName, provider.label, 120),
      encryptedCredentials: credentials.encrypted,
      credentialFingerprint: credentials.fingerprint,
      expiresAt: input.expiresAt,
      refreshAfter: input.refreshAfter,
      externalAccountId: input.externalAccountId ? cleanText(input.externalAccountId, "", 180) : undefined,
      externalAccountLabel: input.externalAccountLabel ? cleanText(input.externalAccountLabel, "", 180) : undefined,
      scopes: encodeJson((input.scopes ?? []).filter((scope) => typeof scope === "string").slice(0, 40)),
      metadata: encodeJson(safeMetadata(input.metadata))
    }
  });
  return serializeProviderConnection(connection);
}

export async function listProviderConnections(userId: string) {
  const connections = await prisma.providerConnection.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" }
  });
  return connections.map(serializeProviderConnection);
}

export async function updateProviderConnection(input: ProviderConnectionUpdateInput) {
  const existing = await prisma.providerConnection.findFirst({
    where: { id: input.connectionId, userId: input.userId }
  });
  if (!existing) throw notFound("Provider connection not found.", "provider_connection_not_found");
  const data: Record<string, unknown> = {};
  if (input.displayName !== undefined) data.displayName = cleanText(input.displayName, existing.displayName, 120);
  if (input.scopes !== undefined) data.scopes = encodeJson(input.scopes.filter((scope) => typeof scope === "string").slice(0, 40));
  if (input.metadata !== undefined) data.metadata = encodeJson(safeMetadata(input.metadata));
  if (input.status !== undefined) data.status = input.status;
  if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt;
  if (input.refreshAfter !== undefined) data.refreshAfter = input.refreshAfter;
  if (input.externalAccountId !== undefined) data.externalAccountId = cleanText(input.externalAccountId, "", 180);
  if (input.externalAccountLabel !== undefined) data.externalAccountLabel = cleanText(input.externalAccountLabel, "", 180);
  if (input.credentials !== undefined) {
    const provider = listConnectorProviders().find((item) => item.providerId === existing.providerId);
    const credentials = encryptedCredentials(input.credentials, provider);
    data.encryptedCredentials = credentials.encrypted;
    data.credentialFingerprint = credentials.fingerprint;
    data.status = "active";
    data.lastFailureReason = null;
  }
  const updated = await prisma.providerConnection.update({
    where: { id: existing.id },
    data
  });
  return serializeProviderConnection(updated);
}

export async function deleteProviderConnection(input: { userId: string; connectionId: string }) {
  const connection = await prisma.providerConnection.findFirst({ where: { id: input.connectionId, userId: input.userId } });
  if (!connection) return false;
  let providerRevoked: boolean | null = null;
  if (connection.providerId === "plaid") {
    const credentials = decodeJson<ProviderCredentials>(decryptProviderCredentials(connection.encryptedCredentials), {}); const clientId = String(credentials.clientId ?? ""); const secret = String(credentials.secret ?? ""); const accessToken = String(credentials.accessToken ?? ""); const environment = String(credentials.environment ?? "sandbox");
    if (clientId && secret && accessToken) {
      const base = environment === "production" ? "https://production.plaid.com" : environment === "development" ? "https://development.plaid.com" : "https://sandbox.plaid.com";
      try { const response = await providerConnectionTestFetchImpl(`${base}/item/remove`, { method: "POST", signal: globalThis.AbortSignal.timeout(env.FINANCE_PROVIDER_TIMEOUT_MS), headers: { "Content-Type": "application/json", "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret }, body: JSON.stringify({ access_token: accessToken }) }); providerRevoked = response.ok; } catch { providerRevoked = false; }
    }
    await prisma.financialAccount.deleteMany({ where: { userId: input.userId, providerId: "plaid" } });
  }
  if (connection.providerId === "strava") {
    const credentials = decodeJson<ProviderCredentials>(decryptProviderCredentials(connection.encryptedCredentials), {});
    const token = String(credentials.refreshToken ?? credentials.accessToken ?? "");
    if (token && env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET) {
      const authorization = Buffer.from(`${env.STRAVA_CLIENT_ID}:${env.STRAVA_CLIENT_SECRET}`).toString("base64");
      try { const response = await providerConnectionTestFetchImpl("https://www.strava.com/oauth/revoke", { method: "POST", signal: globalThis.AbortSignal.timeout(env.WELLNESS_PROVIDER_TIMEOUT_MS), headers: { Authorization: `Basic ${authorization}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token, token_type_hint: credentials.refreshToken ? "refresh_token" : "access_token" }) }); providerRevoked = response.ok; } catch { providerRevoked = false; }
    } else providerRevoked = false;
  }
  await prisma.providerConnection.delete({ where: { id: connection.id } });
  await writeActivityLog({ userId: input.userId, actionType: "api_callback", status: providerRevoked === false ? "error" : "success", dynamicMetadata: { event: "provider_connection_disconnected", providerId: connection.providerId, providerRevoked } });
  return true;
}

export async function getProviderConnectionForExecution(input: { userId: string; providerId: string; connectionId?: string }) {
  const connection = await prisma.providerConnection.findFirst({
    where: { userId: input.userId, providerId: input.providerId, ...(input.connectionId ? { id: input.connectionId } : {}) },
    orderBy: { updatedAt: "desc" }
  });
  if (!connection) return null;
  const provider = listConnectorProviders().find((item) => item.providerId === connection.providerId);
  const ready = await validateStoredConnection({ connection, provider });
  return ready;
}

export async function validateProviderConnection(input: { userId: string; connectionId: string }) {
  const connection = await prisma.providerConnection.findFirst({
    where: { id: input.connectionId, userId: input.userId }
  });
  if (!connection) throw notFound("Provider connection not found.", "provider_connection_not_found");
  const provider = listConnectorProviders().find((item) => item.providerId === connection.providerId);
  const validated = await validateStoredConnection({ connection, provider });
  const credentials = validated.credentials;
  const missing = validated.missing;
  const expired = validated.expired;
  const ok = validated.ok && !isReconnectStatus(validated.connection.status) && Object.values(credentials).some((value) => typeof value === "string" ? Boolean(value.trim()) : value !== null && value !== undefined);
  const now = new Date();
  const updated = await prisma.providerConnection.update({
    where: { id: validated.connection.id },
    data: ok
      ? {
          status: "active",
          lastValidatedAt: now,
          lastSuccessAt: now,
          lastFailureReason: null
        }
      : {
          status: expired ? "expired" : "error",
          lastValidatedAt: now,
          lastFailureAt: now,
          lastFailureReason: expired
            ? "Credentials are expired."
            : missing.length
              ? `Missing credential fields: ${missing.join(", ")}.`
              : "Credentials are missing or invalid."
        }
  });
  return serializeProviderConnection(updated);
}

async function runConnectionTest(input: {
  provider: ProviderAdapter;
  connection: ProviderConnection;
  credentials: ProviderCredentials;
}): Promise<Omit<ProviderConnectionTestResult, "providerId" | "providerLabel" | "checkedAt">> {
  const config = input.provider.runtimeConfig ?? {};
  const endpoint = input.provider.kind === "api"
    ? config.healthEndpointUrl ?? config.endpointUrl
    : config.endpointUrl ?? config.healthEndpointUrl;
  if (!endpoint) {
    return {
      status: "ready",
      message: `${input.provider.label} credentials are saved. No test endpoint is configured.`,
      retryable: false
    };
  }
  const urlDecision = validateExternalUrl(endpoint);
  if (!urlDecision.allowed) {
    return {
      status: "unsafe_endpoint",
      message: `${input.provider.label} has an unsafe test endpoint.`,
      retryable: false,
      nextAction: "fix_workflow"
    };
  }
  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(config.timeoutMs ?? 3000, 500), 10_000));
  const authHeaders = buildProviderAuthHeaders({
    provider: input.provider,
    credentials: input.credentials,
    providerConnection: input.connection,
    runtimeConfig: config,
    baseHeaders: {
      accept: "application/json",
      "content-type": "application/json"
    }
  });
  if (!authHeaders.ok) {
    return {
      status: authHeaders.details.code === "provider_error" ? "needs_setup" : "expired",
      message: authHeaders.details.userMessage,
      retryable: Boolean(authHeaders.details.retryable),
      nextAction: authHeaders.details.nextAction === "fix_workflow" ? "fix_workflow" : "connect_account"
    };
  }
  try {
    const response = await providerConnectionTestFetchImpl(urlDecision.url, {
      method: input.provider.kind === "mcp" ? "POST" : config.healthMethod ?? "GET",
      headers: authHeaders.headers,
      body: input.provider.kind === "mcp"
        ? JSON.stringify({ jsonrpc: "2.0", id: "connection-test", method: "tools/list", params: {} })
        : undefined,
      signal: controller.signal
    });
    if (response.ok) {
      return {
        status: "ready",
        message: `${input.provider.label} is connected and ready.`,
        retryable: false
      };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        status: "needs_setup",
        message: `${input.provider.label} rejected the saved credentials. Reconnect it.`,
        retryable: true,
        nextAction: "connect_account"
      };
    }
    return {
      status: "unreachable",
      message: `${input.provider.label} could not be verified right now.`,
      retryable: response.status >= 500 || response.status === 408 || response.status === 429,
      nextAction: response.status >= 500 ? "try_again" : "fix_workflow"
    };
  } catch (error) {
    return {
      status: "unreachable",
      message: error instanceof Error && error.name === "AbortError"
        ? `${input.provider.label} took too long to respond.`
        : `${input.provider.label} could not be reached.`,
      retryable: true,
      nextAction: "try_again"
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function testProviderConnection(input: { userId: string; connectionId: string }) {
  const connection = await prisma.providerConnection.findFirst({
    where: { id: input.connectionId, userId: input.userId }
  });
  if (!connection) throw notFound("Provider connection not found.", "provider_connection_not_found");
  const provider = listConnectorProviders().find((item) => item.providerId === connection.providerId);
  if (!provider) throw badRequest("This provider is not registered.", "unknown_provider");
  const validated = await validateStoredConnection({ connection, provider });
  const now = new Date();
  if (validated.expired || validated.missing.length || validated.connection.status !== "active") {
    const status: ProviderConnectionTestResult["status"] = validated.expired || isReconnectStatus(validated.connection.status) ? "expired" : "needs_setup";
    const message = validated.expired || isReconnectStatus(validated.connection.status)
      ? `Reconnect ${provider.label} before this agent can continue.`
      : `Add the required credential fields for ${provider.label}: ${validated.missing.join(", ")}.`;
    const updated = await prisma.providerConnection.update({
      where: { id: validated.connection.id },
      data: {
        status: validated.expired ? "expired" : validated.connection.status === "active" ? "error" : validated.connection.status,
        lastValidatedAt: now,
        lastFailureAt: now,
        lastFailureReason: message
      }
    });
    return {
      connection: serializeProviderConnection(updated),
      test: {
        status,
        message,
        providerId: provider.providerId,
        providerLabel: provider.label,
        checkedAt: now.toISOString(),
        retryable: true,
        nextAction: "connect_account" as const
      }
    };
  }
  const test = await runConnectionTest({
    provider,
    connection: validated.connection,
    credentials: validated.credentials
  });
  const ok = test.status === "ready";
  const updated = await prisma.providerConnection.update({
    where: { id: validated.connection.id },
    data: ok
      ? {
          status: "active",
          lastValidatedAt: now,
          lastSuccessAt: now,
          lastFailureReason: null
        }
      : {
          status: test.status === "needs_setup" ? "reconnect_required" : "error",
          lastValidatedAt: now,
          lastFailureAt: now,
          lastFailureReason: test.message
        }
  });
  return {
    connection: serializeProviderConnection(updated),
    test: {
      ...test,
      providerId: provider.providerId,
      providerLabel: provider.label,
      checkedAt: now.toISOString()
    }
  };
}

export async function refreshProviderConnection(input: { userId: string; connectionId: string }) {
  const connection = await prisma.providerConnection.findFirst({
    where: { id: input.connectionId, userId: input.userId }
  });
  if (!connection) throw notFound("Provider connection not found.", "provider_connection_not_found");
  const provider = listConnectorProviders().find((item) => item.providerId === connection.providerId);
  if ((provider?.credentialType ?? connection.authType) !== "oauth" && connection.authType !== "oauth") {
    throw badRequest("This provider connection does not support token refresh.", "provider_refresh_not_supported");
  }
  return serializeProviderConnection((await refreshOAuthConnection({ connection, provider, force: true })).connection);
}
