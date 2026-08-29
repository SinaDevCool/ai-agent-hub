import { getConnectorCapability, type ConnectorAction } from "./connectorCapabilityService.js";
import { normalizeConnectorResult, type NormalizedConnectorResult } from "./connectorResultNormalizer.js";
import { resolveConnectorProvider } from "./connectorProviderRegistryService.js";
import { recordProviderRunReceipt as createProviderReceipt, requestProviderRunApproval } from "./providerRunService.js";
import { getProviderConnectionForExecution } from "./providerConnectionService.js";
import { connectorAttemptIdempotencyKey, shouldRetryProviderResult } from "./providerRetryPolicyService.js";
import { enforceProviderResultContract } from "./providers/providerResultContractService.js";
import { findProviderActionSchema } from "./providers/providerManifestService.js";
import { validateProviderInput } from "./providers/providerInputValidationService.js";
import { getProviderReadinessForExecution } from "./providerHealthService.js";
import { providerConnectionBlockDetails, providerNeedsConnection } from "./providerConnectionPolicyService.js";
import type { ProviderReadinessCode } from "./providerReadinessMessages.js";
import type { ToolBlockDetails, ToolExecutionInput } from "./tools/toolExecutionTypes.js";
import { getLifeCapability } from "./lifePlatformCatalog.js";
import { persistAwaitingLifeApproval } from "./lifeTransactionService.js";
import { isBetaCapabilityAllowed, releaseLevelForAction } from "./featureFlagService.js";

export type ConnectorExecutionInput = {
  userId: string;
  agentId: string;
  agentRunId?: string;
  capabilityKey: string;
  action?: ConnectorAction;
  input: Record<string, unknown>;
  preferredProviderId?: string;
  idempotencyKey?: string;
  approvalOverride?: ToolExecutionInput["approvalOverride"];
};

export type ConnectorExecutionResult =
  | { status: "ok"; toolRunId: string; providerId: string; providerLabel: string; result: NormalizedConnectorResult; rawResult?: Record<string, unknown> }
  | ({ status: "blocked"; toolRunId?: string; reason: string } & Partial<ToolBlockDetails>)
  | { status: "awaiting_human_approval"; toolRunId: string; requestId: string };

function readinessCodeToBlockCode(code: ProviderReadinessCode): ToolBlockDetails["code"] {
  if (code === "missing_credentials") return "connector_not_connected";
  if (code === "connector_expired") return "connector_expired";
  if (code === "provider_timeout" || code === "provider_unauthorized" || code === "provider_unhealthy" || code === "provider_health_unknown") {
    return "provider_unavailable";
  }
  return "provider_error";
}

async function requestSchemaApproval(input: {
  userId: string;
  agentId: string;
  agentRunId?: string;
  idempotencyKey?: string;
  providerId: string;
  providerLabel: string;
  capabilityKey: string;
  capabilityLabel: string;
  action: ConnectorAction;
  toolName: string;
  values: Record<string, unknown>;
}) {
  return requestProviderRunApproval({
    userId: input.userId,
    agentId: input.agentId,
    agentRunId: input.agentRunId,
    toolName: input.toolName,
    input: {
      providerId: input.providerId,
      capabilityKey: input.capabilityKey,
      action: input.action,
      values: input.values
    },
    providerId: input.providerId,
    providerLabel: input.providerLabel,
    capabilityKey: input.capabilityKey,
    capabilityLabel: input.capabilityLabel,
    action: input.action,
    values: input.values,
    riskLevel: "high",
    requiresApproval: true,
    idempotencyKey: input.idempotencyKey
  });
}

export async function executeConnector(input: ConnectorExecutionInput): Promise<ConnectorExecutionResult> {
  const capability = getConnectorCapability(input.capabilityKey);
  if (!capability) {
    await createProviderReceipt({
      userId: input.userId,
      agentId: input.agentId,
      agentRunId: input.agentRunId,
      providerId: "unresolved",
      providerLabel: "Unresolved provider",
      capabilityKey: input.capabilityKey,
      capabilityLabel: input.capabilityKey || "Unknown capability",
      action: input.action ?? "search",
      status: "blocked",
      userMessage: "This agent asked for a capability that is not available yet.",
      technicalMessage: `Unknown connector capability '${input.capabilityKey}'.`,
      retryable: false,
      nextAction: "contact_support"
    });
    return {
      status: "blocked",
      reason: "This agent asked for a provider capability that is not registered.",
      code: "unknown_tool",
      userMessage: "This agent asked for a capability that is not available yet.",
      technicalMessage: `Unknown connector capability '${input.capabilityKey}'.`,
      nextAction: "contact_support",
      retryable: false
    };
  }

  const action = input.action ?? capability.defaultAction;
  const releaseLevel = releaseLevelForAction(action);
  if (!await isBetaCapabilityAllowed(input.userId, releaseLevel)) {
    return {
      status: "blocked",
      reason: "This capability is not enabled for your beta cohort.",
      code: "permission_denied",
      userMessage: "This capability is not enabled for your beta cohort yet.",
      technicalMessage: `Beta release level '${releaseLevel}' is disabled for this user.`,
      nextAction: "contact_support",
      retryable: false
    };
  }
  const provider = resolveConnectorProvider({
    capabilityKey: capability.canonicalKey,
    action,
    preferredProviderId: input.preferredProviderId
  });
  if (!provider) {
    await createProviderReceipt({
      userId: input.userId,
      agentId: input.agentId,
      agentRunId: input.agentRunId,
      providerId: "unresolved",
      providerLabel: "Unresolved provider",
      capabilityKey: capability.canonicalKey,
      capabilityLabel: capability.label,
      action,
      status: "blocked",
      userMessage: `No connected provider is ready for ${capability.label}.`,
      technicalMessage: `No provider for capability '${capability.canonicalKey}' and action '${action}'.`,
      retryable: false,
      nextAction: "contact_support"
    });
    return {
      status: "blocked",
      reason: `No provider is registered for ${capability.label}.`,
      code: "provider_error",
      userMessage: `No connected provider is ready for ${capability.label}.`,
      technicalMessage: `No provider for capability '${capability.canonicalKey}' and action '${action}'.`,
      nextAction: "contact_support",
      retryable: false
    };
  }

  const actionSchema = findProviderActionSchema({
    provider,
    capabilityKey: capability.canonicalKey,
    action
  });

  const readiness = await getProviderReadinessForExecution({
    userId: input.userId,
    provider
  });
  if (!readiness.ok) {
    await createProviderReceipt({
      userId: input.userId,
      agentId: input.agentId,
      agentRunId: input.agentRunId,
      providerId: provider.providerId,
      providerLabel: provider.label,
      capabilityKey: capability.canonicalKey,
      capabilityLabel: capability.label,
      action,
      status: "blocked",
      userMessage: readiness.userMessage,
      technicalMessage: readiness.technicalMessage,
      retryable: readiness.retryable,
      nextAction: readiness.nextAction,
      metadata: {
        code: readiness.code,
        readiness: readiness.readiness,
        state: readiness.state
      }
    });
    return {
      status: "blocked",
      reason: readiness.userMessage,
      code: readinessCodeToBlockCode(readiness.code),
      userMessage: readiness.userMessage,
      technicalMessage: readiness.technicalMessage,
      nextAction: readiness.nextAction,
      retryable: readiness.retryable
    };
  }
  const inputValidation = validateProviderInput({
    schema: actionSchema,
    values: input.input
  });
  if (!inputValidation.ok) {
    await createProviderReceipt({
      userId: input.userId,
      agentId: input.agentId,
      agentRunId: input.agentRunId,
      providerId: provider.providerId,
      providerLabel: provider.label,
      capabilityKey: capability.canonicalKey,
      capabilityLabel: capability.label,
      action,
      status: "blocked",
      userMessage: inputValidation.userMessage,
      technicalMessage: inputValidation.technicalMessage,
      retryable: true,
      nextAction: "add_missing_info",
      metadata: {
        missingFields: inputValidation.missingFields?.join(","),
        invalidFields: inputValidation.invalidFields?.join(",")
      }
    });
    return {
      status: "blocked",
      reason: inputValidation.userMessage,
      code: "invalid_input",
      userMessage: inputValidation.userMessage,
      technicalMessage: inputValidation.technicalMessage,
      nextAction: "add_missing_info",
      retryable: true
    };
  }
  if (actionSchema.requiresApproval && !input.approvalOverride) {
    const approval = await requestSchemaApproval({
      userId: input.userId,
      agentId: input.agentId,
      agentRunId: input.agentRunId,
      idempotencyKey: input.idempotencyKey,
      providerId: provider.providerId,
      providerLabel: provider.label,
      capabilityKey: capability.canonicalKey,
      capabilityLabel: capability.label,
      action,
      toolName: provider.toolName,
      values: inputValidation.values
    });
    if (!approval.reused) {
      await createProviderReceipt({
        userId: input.userId,
        agentId: input.agentId,
        agentRunId: input.agentRunId,
        toolRunId: approval.toolRunId,
        providerId: provider.providerId,
        providerLabel: provider.label,
        capabilityKey: capability.canonicalKey,
        capabilityLabel: capability.label,
        action,
        status: "waiting_for_approval",
        approvalRequired: true,
        hitlRequestId: approval.requestId,
        userMessage: `${capability.label} needs your approval before ${provider.label} can continue.`,
        retryable: true,
        nextAction: "approve_action",
        metadata: { toolName: provider.toolName, schemaApproval: true }
      });
      const lifeCapability = getLifeCapability(capability.canonicalKey);
      if (lifeCapability?.approvalRequired && lifeCapability.executionLevels.includes("transact")) {
        await persistAwaitingLifeApproval({
          userId: input.userId,
          capabilityKey: capability.canonicalKey,
          providerId: provider.providerId,
          values: inputValidation.values,
          idempotencyKey: input.idempotencyKey ?? `${approval.toolRunId}:life`,
          hitlRequestId: approval.requestId
        });
      }
    }
    return {
      status: "awaiting_human_approval",
      toolRunId: approval.toolRunId,
      requestId: approval.requestId
    };
  }

  const needsConnection = providerNeedsConnection(provider);
  const providerConnection = needsConnection
    ? await getProviderConnectionForExecution({ userId: input.userId, providerId: provider.providerId })
    : null;
  if (needsConnection && !providerConnection) {
    const block = providerConnectionBlockDetails({ provider });
    await createProviderReceipt({
      userId: input.userId,
      agentId: input.agentId,
      agentRunId: input.agentRunId,
      providerId: provider.providerId,
      providerLabel: provider.label,
      capabilityKey: capability.canonicalKey,
      capabilityLabel: capability.label,
      action,
      status: "blocked",
      userMessage: block.userMessage,
      technicalMessage: block.technicalMessage,
      retryable: block.retryable,
      nextAction: block.nextAction
    });
    return {
      status: "blocked",
      reason: block.userMessage,
      ...block
    };
  }
  if (providerConnection && providerConnection.connection.status !== "active") {
    const block = providerConnectionBlockDetails({ provider, connection: providerConnection.connection });
    await createProviderReceipt({
      userId: input.userId,
      agentId: input.agentId,
      agentRunId: input.agentRunId,
      providerId: provider.providerId,
      providerLabel: provider.label,
      capabilityKey: capability.canonicalKey,
      capabilityLabel: capability.label,
      action,
      status: "blocked",
      userMessage: block.userMessage,
      technicalMessage: block.technicalMessage,
      retryable: block.retryable,
      nextAction: block.nextAction
    });
    return {
      status: "blocked",
      reason: block.userMessage,
      ...block
    };
  }

  let attempt = 1;
  let previousToolRunId: string | undefined;
  const executeAttempt = () => provider.execute({
    userId: input.userId,
    agentId: input.agentId,
    agentRunId: input.agentRunId,
    capability,
    action,
    input: inputValidation.values,
    idempotencyKey: connectorAttemptIdempotencyKey({ baseKey: input.idempotencyKey, attempt }),
    attempt,
    previousToolRunId,
    approvalOverride: input.approvalOverride,
    providerConnection: providerConnection
      ? {
          id: providerConnection.connection.id,
          status: providerConnection.connection.status,
          displayName: providerConnection.connection.displayName,
          credentials: providerConnection.credentials
        }
      : undefined
  });

  let toolResult = await executeAttempt();

  if (toolResult.status === "awaiting_human_approval") {
    await createProviderReceipt({
      userId: input.userId,
      agentId: input.agentId,
      agentRunId: input.agentRunId,
      toolRunId: toolResult.toolRunId,
      providerId: provider.providerId,
      providerLabel: provider.label,
      capabilityKey: capability.canonicalKey,
      capabilityLabel: capability.label,
      action,
      status: "waiting_for_approval",
      approvalRequired: true,
      hitlRequestId: toolResult.requestId,
      userMessage: `${capability.label} is waiting for your approval before the provider continues.`,
      retryable: true,
      nextAction: "approve_action",
      metadata: { toolName: provider.toolName, attempt }
    });
    return toolResult;
  }
  while (toolResult.status === "blocked") {
    await createProviderReceipt({
      userId: input.userId,
      agentId: input.agentId,
      agentRunId: input.agentRunId,
      toolRunId: toolResult.toolRunId,
      providerId: provider.providerId,
      providerLabel: provider.label,
      capabilityKey: capability.canonicalKey,
      capabilityLabel: capability.label,
      action,
      status: "blocked",
      approvalRequired: Boolean(input.approvalOverride),
      hitlRequestId: input.approvalOverride?.hitlRequestId,
      userMessage: toolResult.userMessage ?? toolResult.reason,
      technicalMessage: toolResult.technicalMessage,
      retryable: toolResult.retryable,
      nextAction: toolResult.nextAction,
      metadata: {
        code: toolResult.code,
        toolName: provider.toolName,
        attempt
      }
    });
    const retryDecision = shouldRetryProviderResult({
      result: toolResult,
      action,
      attempt,
      approvalRequired: Boolean(input.approvalOverride)
    });
    if (retryDecision.retry) {
      previousToolRunId = toolResult.toolRunId;
      attempt = retryDecision.nextAttempt;
      toolResult = await executeAttempt();
      continue;
    }
    return toolResult;
  }
  if (toolResult.status === "awaiting_human_approval") {
    await createProviderReceipt({
      userId: input.userId,
      agentId: input.agentId,
      agentRunId: input.agentRunId,
      toolRunId: toolResult.toolRunId,
      providerId: provider.providerId,
      providerLabel: provider.label,
      capabilityKey: capability.canonicalKey,
      capabilityLabel: capability.label,
      action,
      status: "waiting_for_approval",
      approvalRequired: true,
      hitlRequestId: toolResult.requestId,
      userMessage: `${capability.label} is waiting for your approval before the provider continues.`,
      retryable: true,
      nextAction: "approve_action",
      metadata: { toolName: provider.toolName, attempt }
    });
    return toolResult;
  }

  const normalizedResult = enforceProviderResultContract((provider.normalizeResult ?? normalizeConnectorResult)({
    capabilityKey: capability.canonicalKey,
    action,
    providerId: provider.providerId,
    providerLabel: provider.label,
    toolRunId: toolResult.toolRunId,
    rawResult: toolResult.result
  }));
  await createProviderReceipt({
    userId: input.userId,
    agentId: input.agentId,
    agentRunId: input.agentRunId,
    toolRunId: toolResult.toolRunId,
    providerId: provider.providerId,
    providerLabel: provider.label,
    capabilityKey: normalizedResult.receipt.capabilityKey,
    capabilityLabel: normalizedResult.receipt.capabilityLabel,
    action,
    status: normalizedResult.status === "failed" ? "blocked" : "succeeded",
    approvalRequired: Boolean(input.approvalOverride),
    hitlRequestId: input.approvalOverride?.hitlRequestId,
    resultQuality: (toolResult.result?.workflowResult as { quality?: string } | undefined)?.quality,
    userMessage: normalizedResult.summary,
    retryable: normalizedResult.status === "failed",
    nextAction: normalizedResult.status === "failed" ? "try_again" : undefined,
    itemCount: normalizedResult.items.length,
    externalRequestId: normalizedResult.receipt.externalRequestId,
    endpointHost: normalizedResult.receipt.endpointHost,
    metadata: {
      toolName: provider.toolName,
      title: normalizedResult.title,
      workflowName: normalizedResult.receipt.workflowName,
      attempt
    }
  });

  return {
    status: "ok",
    toolRunId: toolResult.toolRunId,
    providerId: provider.providerId,
    providerLabel: provider.label,
    rawResult: toolResult.result,
    result: normalizedResult
  };
}
