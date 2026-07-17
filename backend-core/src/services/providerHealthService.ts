import { prisma } from "../db/prisma.js";
import { getConnectorCapability, listConnectorCapabilities, normalizeConnectorCapability } from "./connectorCapabilityService.js";
import { listConnectorProviders } from "./connectorProviderRegistryService.js";
import { getProviderConnectionForExecution } from "./providerConnectionService.js";
import { isReconnectProviderConnectionStatus, providerNeedsConnection } from "./providerConnectionPolicyService.js";
import { providerReadinessMessage, type ProviderReadinessCode } from "./providerReadinessMessages.js";
import { validateExternalUrl } from "./policy/externalUrlPolicyService.js";
import type { ProviderAdapter } from "./providers/providerAdapterTypes.js";
import type { ToolBlockDetails } from "./tools/toolExecutionTypes.js";

export type ProviderHealthState = "healthy" | "degraded" | "failing" | "not_configured" | "disabled" | "needs_credentials" | "unknown";
export type ProviderReadinessState = "ready" | "needs_credentials" | "unhealthy" | "disabled" | "not_configured" | "unknown";

export type ProviderHealth = {
  providerId: string;
  providerLabel: string;
  capabilityKey: string;
  capabilityLabel: string;
  state: ProviderHealthState;
  readiness: ProviderReadinessState;
  message: string;
  code?: ProviderReadinessCode;
  nextAction?: ToolBlockDetails["nextAction"];
  recentFailures: number;
  recentSuccesses: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
};

export type ProviderHealthQuery = {
  userId: string;
  agentId?: string;
  capabilityKey?: string;
  providerId?: string;
};

export type ProviderReadinessSummaryStatus = "ready" | "needs_setup" | "unhealthy" | "blocked" | "unknown";

export type ProviderSetupStep = {
  key: string;
  label: string;
  description: string;
  providerId?: string;
  providerLabel?: string;
  capabilityKey?: string;
  capabilityLabel?: string;
  nextAction?: ToolBlockDetails["nextAction"];
};

export type ProviderReadinessSummary = {
  status: ProviderReadinessSummaryStatus;
  canRun: boolean;
  title: string;
  message: string;
  primaryProviderId?: string;
  primaryProviderLabel?: string;
  capabilityKey?: string;
  capabilityLabel?: string;
  nextAction?: ToolBlockDetails["nextAction"];
  setupSteps: ProviderSetupStep[];
  providers: ProviderHealth[];
};

export type ProviderReadinessResult = {
  ok: boolean;
  providerId: string;
  providerLabel: string;
  state: ProviderHealthState;
  readiness: ProviderReadinessState;
  code: ProviderReadinessCode;
  userMessage: string;
  technicalMessage?: string;
  nextAction?: ToolBlockDetails["nextAction"];
  retryable: boolean;
  checkedAt?: string;
};

type FetchLike = typeof fetch;

let healthFetchImpl: FetchLike = fetch;

export function setProviderHealthFetchForTest(nextFetch: FetchLike) {
  healthFetchImpl = nextFetch;
}

export function resetProviderHealthFetchForTest() {
  healthFetchImpl = fetch;
}

function isPoorQuality(quality: string | null) {
  return quality === "partial" || quality === "empty" || quality === "malformed";
}

function safeNextAction(value: string | null | undefined): ToolBlockDetails["nextAction"] {
  if (
    value === "connect_account" ||
    value === "approve_action" ||
    value === "fix_workflow" ||
    value === "grant_access" ||
    value === "add_missing_info" ||
    value === "try_again" ||
    value === "contact_support"
  ) {
    return value;
  }
  return undefined;
}

function toReadiness(state: ProviderHealthState): ProviderReadinessState {
  if (state === "healthy" || state === "degraded") return "ready";
  if (state === "failing") return "unhealthy";
  if (state === "needs_credentials") return "needs_credentials";
  if (state === "disabled") return "disabled";
  if (state === "not_configured") return "not_configured";
  return "unknown";
}

function health(input: Omit<ProviderHealth, "readiness"> & { readiness?: ProviderReadinessState }): ProviderHealth {
  return { ...input, readiness: input.readiness ?? toReadiness(input.state) };
}

function stateFromReceipts(input: {
  providerId: string;
  providerLabel: string;
  capabilityKey: string;
  capabilityLabel: string;
  receipts: Array<{
    status: string;
    resultQuality: string | null;
    retryable: boolean;
    nextAction: string | null;
    createdAt: Date;
  }>;
}): ProviderHealth {
  const recentFailures = input.receipts.filter((receipt) => receipt.status === "blocked").length;
  const recentSuccesses = input.receipts.filter((receipt) => receipt.status === "succeeded").length;
  const lastSuccess = input.receipts.find((receipt) => receipt.status === "succeeded");
  const lastFailure = input.receipts.find((receipt) => receipt.status === "blocked");
  const latest = input.receipts[0];
  const latestPoorQuality = latest?.status === "succeeded" && isPoorQuality(latest.resultQuality);

  if (latest?.status === "succeeded" && !latestPoorQuality) {
    return health({
      providerId: input.providerId,
      providerLabel: input.providerLabel,
      capabilityKey: input.capabilityKey,
      capabilityLabel: input.capabilityLabel,
      state: "healthy",
      message: `${input.capabilityLabel} is working normally.`,
      recentFailures,
      recentSuccesses,
      lastSuccessAt: lastSuccess?.createdAt.toISOString(),
      lastFailureAt: lastFailure?.createdAt.toISOString()
    });
  }

  const consecutiveFailures = input.receipts.slice(0, 3).filter((receipt) => receipt.status === "blocked").length;
  if (consecutiveFailures >= 3 || (recentFailures >= 3 && !recentSuccesses)) {
    return health({
      providerId: input.providerId,
      providerLabel: input.providerLabel,
      capabilityKey: input.capabilityKey,
      capabilityLabel: input.capabilityLabel,
      state: "failing",
      message: `${input.capabilityLabel} has failed repeatedly. Check the connected provider before relying on it.`,
      nextAction: safeNextAction(latest?.nextAction) ?? "fix_workflow",
      recentFailures,
      recentSuccesses,
      lastSuccessAt: lastSuccess?.createdAt.toISOString(),
      lastFailureAt: lastFailure?.createdAt.toISOString()
    });
  }

  return health({
    providerId: input.providerId,
    providerLabel: input.providerLabel,
    capabilityKey: input.capabilityKey,
    capabilityLabel: input.capabilityLabel,
    state: "degraded",
    message: latestPoorQuality
      ? `${input.capabilityLabel} responded, but the result quality needs attention.`
      : `${input.capabilityLabel} recently had a provider issue.`,
    nextAction: safeNextAction(latest?.nextAction) ?? (latestPoorQuality ? "try_again" : undefined),
    recentFailures,
    recentSuccesses,
    lastSuccessAt: lastSuccess?.createdAt.toISOString(),
    lastFailureAt: lastFailure?.createdAt.toISOString()
  });
}

async function configuredState(input: {
  userId: string;
  agentId?: string;
  capabilityKey: string;
  capabilityLabel: string;
  providerId: string;
  providerLabel: string;
}) {
  const workflows = await prisma.workflowConnection.findMany({
    where: {
      userId: input.userId,
      agentId: input.agentId,
      capabilityKey: input.capabilityKey
    },
    orderBy: { updatedAt: "desc" },
    take: 5
  });
  if (workflows.some((workflow) => workflow.status === "active")) {
    return health({
      providerId: input.providerId,
      providerLabel: input.providerLabel,
      capabilityKey: input.capabilityKey,
      capabilityLabel: input.capabilityLabel,
      state: "healthy",
      message: `${input.capabilityLabel} has an active provider connection and no recent failures.`,
      recentFailures: 0,
      recentSuccesses: 0
    });
  }
  if (workflows.some((workflow) => workflow.status === "disabled")) {
    return health({
      providerId: input.providerId,
      providerLabel: input.providerLabel,
      capabilityKey: input.capabilityKey,
      capabilityLabel: input.capabilityLabel,
      state: "disabled",
      message: `${input.capabilityLabel} has a disabled workflow.`,
      nextAction: "fix_workflow",
      recentFailures: 0,
      recentSuccesses: 0
    });
  }
  return health({
    providerId: input.providerId,
    providerLabel: input.providerLabel,
    capabilityKey: input.capabilityKey,
    capabilityLabel: input.capabilityLabel,
    state: "not_configured",
    message: `Connect a provider for ${input.capabilityLabel} before agents can use it.`,
    nextAction: "fix_workflow",
    recentFailures: 0,
    recentSuccesses: 0
  });
}

function unknownProviderState(input: {
  providerId: string;
  capabilityKey: string;
  capabilityLabel: string;
}) {
  return health({
    providerId: input.providerId,
    providerLabel: input.providerId,
    capabilityKey: input.capabilityKey,
    capabilityLabel: input.capabilityLabel,
    state: "not_configured",
    readiness: "not_configured",
    code: "provider_not_configured",
    message: "This provider is not registered or is no longer available.",
    nextAction: "fix_workflow",
    recentFailures: 0,
    recentSuccesses: 0
  });
}

function providerUnknownState(input: {
  provider: ProviderAdapter;
  capabilityKey: string;
  capabilityLabel: string;
}) {
  return health({
    providerId: input.provider.providerId,
    providerLabel: input.provider.label,
    capabilityKey: input.capabilityKey,
    capabilityLabel: input.capabilityLabel,
    state: "unknown",
    readiness: "unknown",
    code: "provider_health_unknown",
    message: providerReadinessMessage({ code: "provider_health_unknown", providerLabel: input.provider.label }),
    nextAction: input.provider.supportsHealthCheck ? "try_again" : "fix_workflow",
    recentFailures: 0,
    recentSuccesses: 0
  });
}

async function connectionState(input: {
  userId: string;
  providerId: string;
  capabilityKey: string;
  capabilityLabel: string;
}): Promise<ProviderHealth | null> {
  const provider = listConnectorProviders().find((item) => item.providerId === input.providerId);
  if (!provider || !providerNeedsConnection(provider)) return null;
  const connection = await prisma.providerConnection.findFirst({
    where: { userId: input.userId, providerId: input.providerId },
    orderBy: { updatedAt: "desc" }
  });
  if (!connection) {
    return health({
      providerId: provider.providerId,
      providerLabel: provider.label,
      capabilityKey: input.capabilityKey,
      capabilityLabel: input.capabilityLabel,
      state: "needs_credentials",
      code: "missing_credentials",
      message: providerReadinessMessage({ code: "missing_credentials", providerLabel: provider.label }),
      nextAction: "connect_account",
      recentFailures: 0,
      recentSuccesses: 0
    });
  }
  if (connection.status === "active") {
    return health({
      providerId: provider.providerId,
      providerLabel: provider.label,
      capabilityKey: input.capabilityKey,
      capabilityLabel: input.capabilityLabel,
      state: "healthy",
      message: `${provider.label} is connected and ready for ${input.capabilityLabel}.`,
      recentFailures: 0,
      recentSuccesses: 0,
      lastSuccessAt: connection.lastSuccessAt?.toISOString()
    });
  }
  return health({
    providerId: provider.providerId,
    providerLabel: provider.label,
    capabilityKey: input.capabilityKey,
    capabilityLabel: input.capabilityLabel,
    state: connection.status === "disabled" ? "disabled" : "needs_credentials",
    code: connection.status === "disabled"
      ? "provider_disabled"
      : isReconnectProviderConnectionStatus(connection.status)
        ? "connector_expired"
        : "provider_unhealthy",
    message: connection.status === "disabled"
      ? providerReadinessMessage({ code: "provider_disabled", providerLabel: provider.label })
      : providerReadinessMessage({
          code: isReconnectProviderConnectionStatus(connection.status) ? "connector_expired" : "provider_unhealthy",
          providerLabel: provider.label
        }),
    nextAction: isReconnectProviderConnectionStatus(connection.status) ? "connect_account" : "fix_workflow",
    recentFailures: 0,
    recentSuccesses: 0,
    lastFailureAt: connection.lastFailureAt?.toISOString()
  });
}

function storedHealthToResult(input: {
  provider: ProviderAdapter;
  healthStatus?: string | null;
  healthFailureCode?: string | null;
  healthFailureMessage?: string | null;
  healthCheckedAt?: Date | null;
}): ProviderReadinessResult {
  if (input.healthStatus === "healthy") {
    return {
      ok: true,
      providerId: input.provider.providerId,
      providerLabel: input.provider.label,
      state: "healthy",
      readiness: "ready",
      code: "provider_ready",
      userMessage: providerReadinessMessage({ code: "provider_ready", providerLabel: input.provider.label }),
      retryable: false,
      checkedAt: input.healthCheckedAt?.toISOString()
    };
  }
  if (input.healthStatus === "unhealthy") {
    const code: ProviderReadinessCode = input.healthFailureCode === "provider_timeout" ? "provider_timeout" : "provider_unhealthy";
    return {
      ok: false,
      providerId: input.provider.providerId,
      providerLabel: input.provider.label,
      state: "failing",
      readiness: "unhealthy",
      code,
      userMessage: providerReadinessMessage({ code, providerLabel: input.provider.label }),
      technicalMessage: input.healthFailureMessage ?? `Provider health status is '${input.healthStatus}'.`,
      nextAction: code === "provider_timeout" ? "try_again" : "fix_workflow",
      retryable: code === "provider_timeout",
      checkedAt: input.healthCheckedAt?.toISOString()
    };
  }
  return {
    ok: true,
    providerId: input.provider.providerId,
    providerLabel: input.provider.label,
    state: "unknown",
    readiness: "unknown",
    code: "provider_health_unknown",
    userMessage: providerReadinessMessage({ code: "provider_health_unknown", providerLabel: input.provider.label }),
    retryable: true,
    checkedAt: input.healthCheckedAt?.toISOString()
  };
}

async function runProviderHealthCheck(provider: ProviderAdapter): Promise<ProviderReadinessResult> {
  const now = new Date();
  const definition = await prisma.providerDefinition.findUnique({ where: { providerId: provider.providerId } });
  if (!definition) return storedHealthToResult({ provider });
  if (definition.status === "disabled") {
    return {
      ok: false,
      providerId: provider.providerId,
      providerLabel: provider.label,
      state: "disabled",
      readiness: "disabled",
      code: "provider_disabled",
      userMessage: providerReadinessMessage({ code: "provider_disabled", providerLabel: provider.label }),
      technicalMessage: "Provider definition is disabled.",
      nextAction: "fix_workflow",
      retryable: false,
      checkedAt: now.toISOString()
    };
  }
  if (definition.status !== "active") {
    return {
      ok: false,
      providerId: provider.providerId,
      providerLabel: provider.label,
      state: "not_configured",
      readiness: "not_configured",
      code: "provider_not_configured",
      userMessage: providerReadinessMessage({ code: "provider_not_configured", providerLabel: provider.label }),
      technicalMessage: `Provider definition status is '${definition.status}'.`,
      nextAction: "fix_workflow",
      retryable: false,
      checkedAt: now.toISOString()
    };
  }
  if (!provider.supportsHealthCheck) {
    return storedHealthToResult({
      provider,
      healthStatus: definition.healthStatus,
      healthFailureCode: definition.healthFailureCode,
      healthFailureMessage: definition.healthFailureMessage,
      healthCheckedAt: definition.healthCheckedAt
    });
  }
  const endpointUrl = provider.runtimeConfig?.healthEndpointUrl;
  const urlDecision = validateExternalUrl(endpointUrl);
  if (!endpointUrl || !urlDecision.allowed) {
    const message = endpointUrl ? urlDecision.reason : "Provider health endpoint is missing.";
    await prisma.providerDefinition.update({
      where: { id: definition.id },
      data: {
        healthStatus: "unhealthy",
        healthFailureCode: "invalid_provider_config",
        healthFailureMessage: message,
        healthCheckedAt: now,
        healthLastFailureAt: now
      }
    });
    return {
      ok: false,
      providerId: provider.providerId,
      providerLabel: provider.label,
      state: "not_configured",
      readiness: "not_configured",
      code: "invalid_provider_config",
      userMessage: providerReadinessMessage({ code: "invalid_provider_config", providerLabel: provider.label }),
      technicalMessage: message,
      nextAction: "fix_workflow",
      retryable: false,
      checkedAt: now.toISOString()
    };
  }
  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(provider.runtimeConfig?.timeoutMs ?? 3000, 500), 10_000));
  try {
    const response = await healthFetchImpl(urlDecision.url, {
      method: provider.runtimeConfig?.healthMethod ?? "GET",
      headers: { accept: "application/json", ...(provider.runtimeConfig?.headers ?? {}) },
      signal: controller.signal
    });
    if (response.ok) {
      await prisma.providerDefinition.update({
        where: { id: definition.id },
        data: {
          healthStatus: "healthy",
          healthFailureCode: null,
          healthFailureMessage: null,
          healthCheckedAt: now,
          healthLastSuccessAt: now
        }
      });
      return {
        ok: true,
        providerId: provider.providerId,
        providerLabel: provider.label,
        state: "healthy",
        readiness: "ready",
        code: "provider_ready",
        userMessage: providerReadinessMessage({ code: "provider_ready", providerLabel: provider.label }),
        retryable: false,
        checkedAt: now.toISOString()
      };
    }
    const unauthorized = response.status === 401 || response.status === 403;
    const code: ProviderReadinessCode = unauthorized ? "provider_unauthorized" : "provider_unhealthy";
    await prisma.providerDefinition.update({
      where: { id: definition.id },
      data: {
        healthStatus: "unhealthy",
        healthFailureCode: code,
        healthFailureMessage: `Provider health returned HTTP ${response.status}.`,
        healthCheckedAt: now,
        healthLastFailureAt: now
      }
    });
    return {
      ok: false,
      providerId: provider.providerId,
      providerLabel: provider.label,
      state: "failing",
      readiness: "unhealthy",
      code,
      userMessage: providerReadinessMessage({ code, providerLabel: provider.label }),
      technicalMessage: `Provider health returned HTTP ${response.status}.`,
      nextAction: unauthorized ? "connect_account" : "fix_workflow",
      retryable: response.status >= 500,
      checkedAt: now.toISOString()
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    const code: ProviderReadinessCode = timedOut ? "provider_timeout" : "provider_unhealthy";
    const message = timedOut ? "Provider health timed out." : "Provider health request failed.";
    await prisma.providerDefinition.update({
      where: { id: definition.id },
      data: {
        healthStatus: "unhealthy",
        healthFailureCode: code,
        healthFailureMessage: message,
        healthCheckedAt: now,
        healthLastFailureAt: now
      }
    });
    return {
      ok: false,
      providerId: provider.providerId,
      providerLabel: provider.label,
      state: "failing",
      readiness: "unhealthy",
      code,
      userMessage: providerReadinessMessage({ code, providerLabel: provider.label }),
      technicalMessage: message,
      nextAction: timedOut ? "try_again" : "fix_workflow",
      retryable: true,
      checkedAt: now.toISOString()
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkProviderDefinitionHealth(input: { providerId: string }) {
  const provider = listConnectorProviders().find((item) => item.providerId === input.providerId);
  if (!provider) {
    return {
      ok: false,
      providerId: input.providerId,
      providerLabel: "Unknown provider",
      state: "not_configured" as const,
      readiness: "not_configured" as const,
      code: "provider_not_configured" as const,
      userMessage: "This provider is not registered.",
      technicalMessage: "Provider is not loaded in the registry.",
      nextAction: "fix_workflow",
      retryable: false
    };
  }
  return runProviderHealthCheck(provider);
}

export async function getProviderReadinessForExecution(input: {
  userId: string;
  provider: ProviderAdapter;
}): Promise<ProviderReadinessResult> {
  const definition = await prisma.providerDefinition.findUnique({ where: { providerId: input.provider.providerId } });
  if (definition?.status === "disabled") {
    return {
      ok: false,
      providerId: input.provider.providerId,
      providerLabel: input.provider.label,
      state: "disabled",
      readiness: "disabled",
      code: "provider_disabled",
      userMessage: providerReadinessMessage({ code: "provider_disabled", providerLabel: input.provider.label }),
      technicalMessage: "Provider definition is disabled.",
      nextAction: "fix_workflow",
      retryable: false
    };
  }
  if (definition && definition.status !== "active") {
    return {
      ok: false,
      providerId: input.provider.providerId,
      providerLabel: input.provider.label,
      state: "not_configured",
      readiness: "not_configured",
      code: "provider_not_configured",
      userMessage: providerReadinessMessage({ code: "provider_not_configured", providerLabel: input.provider.label }),
      technicalMessage: `Provider definition status is '${definition.status}'.`,
      nextAction: "fix_workflow",
      retryable: false
    };
  }
  if (providerNeedsConnection(input.provider)) {
    const connection = await getProviderConnectionForExecution({ userId: input.userId, providerId: input.provider.providerId });
    if (!connection) {
      return {
        ok: false,
        providerId: input.provider.providerId,
        providerLabel: input.provider.label,
        state: "needs_credentials",
        readiness: "needs_credentials",
        code: "missing_credentials",
        userMessage: providerReadinessMessage({ code: "missing_credentials", providerLabel: input.provider.label }),
        technicalMessage: `Missing provider connection for '${input.provider.providerId}'.`,
        nextAction: "connect_account",
        retryable: true
      };
    }
    if (connection.connection.status !== "active") {
      const code: ProviderReadinessCode = isReconnectProviderConnectionStatus(connection.connection.status)
        ? "connector_expired"
        : connection.connection.status === "disabled"
          ? "provider_disabled"
        : "provider_unhealthy";
      return {
        ok: false,
        providerId: input.provider.providerId,
        providerLabel: input.provider.label,
        state: connection.connection.status === "disabled" ? "disabled" : "needs_credentials",
        readiness: connection.connection.status === "disabled" ? "disabled" : "needs_credentials",
        code,
        userMessage: providerReadinessMessage({ code, providerLabel: input.provider.label }),
        technicalMessage: `Provider connection '${connection.connection.id}' status is '${connection.connection.status}'.`,
        nextAction: code === "connector_expired" ? "connect_account" : "fix_workflow",
        retryable: code !== "provider_disabled"
      };
    }
  }
  if (definition?.healthStatus === "unhealthy" && !input.provider.supportsHealthCheck) {
    return storedHealthToResult({
      provider: input.provider,
      healthStatus: definition.healthStatus,
      healthFailureCode: definition.healthFailureCode,
      healthFailureMessage: definition.healthFailureMessage,
      healthCheckedAt: definition.healthCheckedAt
    });
  }
  if (input.provider.supportsHealthCheck && (!definition?.healthCheckedAt || definition.healthStatus !== "healthy")) {
    return runProviderHealthCheck(input.provider);
  }
  return {
    ok: true,
    providerId: input.provider.providerId,
    providerLabel: input.provider.label,
    state: definition?.healthStatus === "healthy" ? "healthy" : "unknown",
    readiness: definition?.healthStatus === "healthy" ? "ready" : "unknown",
    code: definition?.healthStatus === "healthy" ? "provider_ready" : "provider_health_unknown",
    userMessage: providerReadinessMessage({
      code: definition?.healthStatus === "healthy" ? "provider_ready" : "provider_health_unknown",
      providerLabel: input.provider.label
    }),
    retryable: false,
    checkedAt: definition?.healthCheckedAt?.toISOString()
  };
}

export async function getProviderHealthForUser(input: ProviderHealthQuery): Promise<ProviderHealth[]> {
  const capabilityKeys = input.capabilityKey
    ? [normalizeConnectorCapability(input.capabilityKey)].filter((key): key is string => Boolean(key))
    : listConnectorCapabilities().map((capability) => capability.canonicalKey);

  const healthResults: ProviderHealth[] = [];
  for (const capabilityKey of capabilityKeys) {
    const capability = getConnectorCapability(capabilityKey);
    if (!capability) continue;
    const receipts = await prisma.providerReceipt.findMany({
      where: {
        userId: input.userId,
        agentId: input.agentId,
        providerId: input.providerId,
        capabilityKey: capability.canonicalKey
      },
      orderBy: { createdAt: "desc" },
      take: 10
    });
    if (receipts.length) {
      const providerId = receipts[0]?.providerId ?? input.providerId ?? "workflow";
      const providerLabel = receipts[0]?.providerLabel ?? "Connected provider";
      healthResults.push(stateFromReceipts({
        providerId,
        providerLabel,
        capabilityKey: capability.canonicalKey,
        capabilityLabel: capability.label,
        receipts
      }));
      continue;
    }
    if (input.providerId) {
      const provider = listConnectorProviders().find((item) => item.providerId === input.providerId);
      const definition = provider
        ? await prisma.providerDefinition.findUnique({ where: { providerId: input.providerId } })
        : null;
      if (provider && definition?.status === "disabled") {
        healthResults.push(health({
          providerId: provider.providerId,
          providerLabel: provider.label,
          capabilityKey: capability.canonicalKey,
          capabilityLabel: capability.label,
          state: "disabled",
          readiness: "disabled",
          code: "provider_disabled",
          message: providerReadinessMessage({ code: "provider_disabled", providerLabel: provider.label }),
          nextAction: "fix_workflow",
          recentFailures: 0,
          recentSuccesses: 0,
          lastFailureAt: definition.healthLastFailureAt?.toISOString()
        }));
        continue;
      }
      if (provider && definition && (definition.healthStatus === "healthy" || definition.healthStatus === "unhealthy")) {
        const readiness = storedHealthToResult({
          provider,
          healthStatus: definition.healthStatus,
          healthFailureCode: definition.healthFailureCode,
          healthFailureMessage: definition.healthFailureMessage,
          healthCheckedAt: definition.healthCheckedAt
        });
        healthResults.push(health({
          providerId: provider.providerId,
          providerLabel: provider.label,
          capabilityKey: capability.canonicalKey,
          capabilityLabel: capability.label,
          state: readiness.state,
          readiness: readiness.readiness,
          code: readiness.code,
          message: readiness.userMessage,
          nextAction: readiness.nextAction,
          recentFailures: readiness.ok ? 0 : 1,
          recentSuccesses: readiness.ok ? 1 : 0,
          lastSuccessAt: definition.healthLastSuccessAt?.toISOString(),
          lastFailureAt: definition.healthLastFailureAt?.toISOString()
        }));
        continue;
      }
      const providerConnectionState = await connectionState({
        userId: input.userId,
        providerId: input.providerId,
        capabilityKey: capability.canonicalKey,
        capabilityLabel: capability.label
      });
      if (providerConnectionState) {
        healthResults.push(providerConnectionState);
        continue;
      }
      if (!provider) {
        healthResults.push(unknownProviderState({
          providerId: input.providerId,
          capabilityKey: capability.canonicalKey,
          capabilityLabel: capability.label
        }));
        continue;
      }
      if (provider.providerId !== "workflow") {
        healthResults.push(providerUnknownState({
          provider,
          capabilityKey: capability.canonicalKey,
          capabilityLabel: capability.label
        }));
        continue;
      }
    }
    healthResults.push(await configuredState({
      userId: input.userId,
      agentId: input.agentId,
      capabilityKey: capability.canonicalKey,
      capabilityLabel: capability.label,
      providerId: input.providerId ?? "workflow",
      providerLabel: "Connected workflow"
    }));
  }
  return healthResults;
}

function readinessRank(healthResult: ProviderHealth) {
  if (healthResult.readiness === "needs_credentials") return 0;
  if (healthResult.readiness === "not_configured") return 1;
  if (healthResult.readiness === "disabled") return 2;
  if (healthResult.readiness === "unhealthy") return 3;
  if (healthResult.readiness === "unknown") return 4;
  return 5;
}

function setupStepForProvider(healthResult: ProviderHealth): ProviderSetupStep {
  const key = `${healthResult.providerId}:${healthResult.capabilityKey}:${healthResult.readiness}`;
  const base = {
    key,
    providerId: healthResult.providerId,
    providerLabel: healthResult.providerLabel,
    capabilityKey: healthResult.capabilityKey,
    capabilityLabel: healthResult.capabilityLabel,
    nextAction: healthResult.nextAction
  };

  if (healthResult.readiness === "needs_credentials") {
    return {
      ...base,
      label: `Connect ${healthResult.providerLabel}`,
      description: healthResult.message
    };
  }
  if (healthResult.readiness === "not_configured") {
    return {
      ...base,
      label: `Set up ${healthResult.capabilityLabel}`,
      description: healthResult.message
    };
  }
  if (healthResult.readiness === "disabled") {
    return {
      ...base,
      label: `Turn on ${healthResult.providerLabel}`,
      description: healthResult.message
    };
  }
  if (healthResult.readiness === "unhealthy") {
    return {
      ...base,
      label: `Check ${healthResult.providerLabel}`,
      description: healthResult.message
    };
  }
  return {
    ...base,
    label: `Check ${healthResult.providerLabel}`,
    description: healthResult.message
  };
}

function dedupeSetupSteps(steps: ProviderSetupStep[]) {
  const seen = new Set<string>();
  const deduped: ProviderSetupStep[] = [];
  for (const step of steps) {
    if (seen.has(step.key)) continue;
    seen.add(step.key);
    deduped.push(step);
  }
  return deduped;
}

function summaryForBlocker(input: {
  blocker: ProviderHealth;
  providers: ProviderHealth[];
  setupSteps: ProviderSetupStep[];
}): ProviderReadinessSummary {
  const { blocker } = input;
  const status: ProviderReadinessSummaryStatus =
    blocker.readiness === "needs_credentials" || blocker.readiness === "not_configured"
      ? "needs_setup"
      : blocker.readiness === "disabled"
        ? "blocked"
        : blocker.readiness === "unhealthy"
          ? "unhealthy"
          : "unknown";

  const title =
    blocker.readiness === "needs_credentials"
      ? `Connect ${blocker.providerLabel}`
      : blocker.readiness === "not_configured"
        ? `Set up ${blocker.capabilityLabel}`
        : blocker.readiness === "disabled"
          ? `${blocker.providerLabel} is turned off`
          : blocker.readiness === "unhealthy"
            ? `${blocker.providerLabel} needs attention`
            : `Check ${blocker.providerLabel}`;

  return {
    status,
    canRun: false,
    title,
    message: blocker.message,
    primaryProviderId: blocker.providerId,
    primaryProviderLabel: blocker.providerLabel,
    capabilityKey: blocker.capabilityKey,
    capabilityLabel: blocker.capabilityLabel,
    nextAction: blocker.nextAction,
    setupSteps: input.setupSteps,
    providers: input.providers
  };
}

export async function getProviderReadinessSummary(input: ProviderHealthQuery): Promise<ProviderReadinessSummary> {
  const providers = await getProviderHealthForUser(input);
  if (!providers.length) {
    return {
      status: "unknown",
      canRun: false,
      title: "Provider readiness is unknown",
      message: "No provider readiness information is available for this request.",
      nextAction: "try_again",
      setupSteps: [],
      providers
    };
  }

  const readyProvider = providers.find((item) => item.readiness === "ready");
  if (readyProvider) {
    return {
      status: "ready",
      canRun: true,
      title: `${readyProvider.providerLabel} is ready`,
      message: readyProvider.message,
      primaryProviderId: readyProvider.providerId,
      primaryProviderLabel: readyProvider.providerLabel,
      capabilityKey: readyProvider.capabilityKey,
      capabilityLabel: readyProvider.capabilityLabel,
      setupSteps: [],
      providers
    };
  }

  const blocker = [...providers].sort((a, b) => readinessRank(a) - readinessRank(b))[0];
  if (!blocker) {
    return {
      status: "unknown",
      canRun: false,
      title: "Provider readiness is unknown",
      message: "No provider readiness information is available for this request.",
      nextAction: "try_again",
      setupSteps: [],
      providers
    };
  }

  const setupSteps = dedupeSetupSteps(providers
    .filter((item) => item.readiness !== "ready")
    .sort((a, b) => readinessRank(a) - readinessRank(b))
    .map(setupStepForProvider));

  return summaryForBlocker({ blocker, providers, setupSteps });
}
