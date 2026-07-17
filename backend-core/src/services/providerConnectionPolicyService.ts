import type { ProviderConnectionStatus } from "@prisma/client";
import type { ProviderAdapter, ProviderRuntimeConfig } from "./providers/providerAdapterTypes.js";
import { providerReadinessMessage } from "./providerReadinessMessages.js";
import type { ToolBlockDetails } from "./tools/toolExecutionTypes.js";

export type ProviderCredentials = Record<string, unknown>;

export type ProviderConnectionLike = {
  id?: string;
  status: ProviderConnectionStatus | string;
};

export type ProviderAuthHeaderResult =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; details: ToolBlockDetails };

export function providerNeedsConnection(provider: Pick<ProviderAdapter, "requiresConnectedAccount" | "authType">) {
  return provider.requiresConnectedAccount || !["none", "workflow_secret"].includes(provider.authType ?? "none");
}

export function isReconnectProviderConnectionStatus(status: ProviderConnectionStatus | string) {
  return status === "expired" || status === "revoked" || status === "reconnect_required";
}

export function isProviderConnectionUsable(connection: ProviderConnectionLike | null | undefined) {
  return Boolean(connection && connection.status === "active");
}

export function credentialValue(credentials: ProviderCredentials | undefined, key: string | undefined) {
  if (!credentials || !key) return null;
  const value = credentials[key];
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

export function providerConnectionUserMessage(input: {
  providerLabel: string;
  status?: ProviderConnectionStatus | string;
}) {
  if (!input.status) return providerReadinessMessage({ code: "missing_credentials", providerLabel: input.providerLabel });
  if (isReconnectProviderConnectionStatus(input.status)) return providerReadinessMessage({ code: "connector_expired", providerLabel: input.providerLabel });
  if (input.status === "disabled") return providerReadinessMessage({ code: "provider_disabled", providerLabel: input.providerLabel });
  if (input.status === "refreshing") return `${input.providerLabel} is refreshing. Try again in a moment.`;
  if (input.status === "error") return `${input.providerLabel} is not ready. Check this provider connection before using it.`;
  return providerReadinessMessage({ code: "missing_credentials", providerLabel: input.providerLabel });
}

export function providerConnectionBlockDetails(input: {
  provider: Pick<ProviderAdapter, "providerId" | "label">;
  connection?: ProviderConnectionLike | null;
}): ToolBlockDetails {
  const status = input.connection?.status;
  const reconnect = status ? isReconnectProviderConnectionStatus(status) : false;
  const disabled = status === "disabled";
  const refreshing = status === "refreshing";
  return {
    code: reconnect ? "connector_expired" : disabled || refreshing || status === "error" ? "provider_unavailable" : "connector_not_connected",
    userMessage: providerConnectionUserMessage({ providerLabel: input.provider.label, status }),
    technicalMessage: input.connection?.id
      ? `Provider connection '${input.connection.id}' status is '${status}'.`
      : `Missing provider connection for '${input.provider.providerId}'.`,
    nextAction: reconnect || !status ? "connect_account" : refreshing ? "try_again" : "fix_workflow",
    retryable: !disabled
  };
}

export function buildProviderAuthHeaders(input: {
  provider: ProviderAdapter;
  credentials?: ProviderCredentials;
  runtimeConfig?: ProviderRuntimeConfig;
  baseHeaders?: Record<string, string>;
  requireConnection?: boolean;
  providerConnection?: ProviderConnectionLike | null;
}): ProviderAuthHeaderResult {
  const config = input.runtimeConfig ?? input.provider.runtimeConfig ?? {};
  const headers: Record<string, string> = {
    ...(input.baseHeaders ?? {}),
    ...(config.headers ?? {})
  };

  if ((config.authHeaderName || config.authCredentialKey) && (!config.authHeaderName || !config.authCredentialKey)) {
    return {
      ok: false,
      details: {
        code: "provider_error",
        userMessage: "This provider auth setup is incomplete.",
        technicalMessage: "Provider runtime authHeaderName and authCredentialKey must be configured together.",
        nextAction: "fix_workflow",
        retryable: false
      }
    };
  }

  if (config.authHeaderName && config.authCredentialKey) {
    const credential = credentialValue(input.credentials, config.authCredentialKey);
    if (!credential) {
      return {
        ok: false,
        details: {
          code: "connector_not_connected",
          userMessage: providerReadinessMessage({ code: "missing_credentials", providerLabel: input.provider.label }),
          technicalMessage: `Missing credential '${config.authCredentialKey}' for provider '${input.provider.providerId}'.`,
          nextAction: "connect_account",
          retryable: true
        }
      };
    }
    headers[config.authHeaderName] = credential;
    return { ok: true, headers };
  }

  if (input.provider.credentialType === "api_key") {
    const apiKey = credentialValue(input.credentials, "apiKey");
    if (apiKey) headers["x-api-key"] = apiKey;
  }
  if (input.provider.credentialType === "bearer_token" || input.provider.credentialType === "oauth") {
    const token = credentialValue(input.credentials, "bearerToken") ?? credentialValue(input.credentials, "accessToken");
    if (token) headers.authorization = token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
  }

  const needsConnection = input.requireConnection ?? providerNeedsConnection(input.provider);
  if (needsConnection && !input.providerConnection) {
    return {
      ok: false,
      details: providerConnectionBlockDetails({ provider: input.provider, connection: input.providerConnection })
    };
  }

  return { ok: true, headers };
}
