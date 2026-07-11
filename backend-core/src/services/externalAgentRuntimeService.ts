import { createHitlRequest } from "./hitlService.js";
import { evaluateVaultPermission, isHighRiskAction, logDecision } from "./permissionEngine.js";
import { serializeVaultDocument } from "./serializerService.js";
import { searchVaultDocuments } from "./vaultIndexService.js";
import { writeActivityLog } from "./activityLogService.js";
import { runExternalRuntimeProxy } from "./externalRuntimeProxyService.js";
import type { AgentCapabilityManifest, RuntimeAgent, RuntimeIntent, RuntimeResult } from "./agentRuntimeTypes.js";
import { consumeApprovedHitlRequest, isContinueApprovedActionMessage } from "./runtimeApprovalService.js";
import { getRequestedAction } from "./runtimeIntentService.js";
import { getAllowedVaultSchemas } from "./runtimePermissionService.js";

type RuntimeSourceType = NonNullable<AgentCapabilityManifest["sourceType"]>;
type ExternalSourceType = "mcp_server" | "openapi_endpoint";

function isExternalSource(sourceType: RuntimeSourceType): sourceType is ExternalSourceType {
  return sourceType === "mcp_server" || sourceType === "openapi_endpoint";
}

function sourceLabel(sourceType: ExternalSourceType) {
  return sourceType === "mcp_server" ? "external MCP helper" : "external OpenAPI helper";
}

async function blockUnverifiedExternal(input: {
  userId: string;
  agent: RuntimeAgent;
  sourceType: ExternalSourceType;
  endpoint?: string;
}): Promise<RuntimeResult> {
  await writeActivityLog({
    userId: input.userId,
    agentId: input.agent.id,
    actionType: "execution_triggered",
    status: "blocked_by_policy",
    dataAccessed: input.sourceType,
    dynamicMetadata: {
      source: "external_agent_runtime",
      reason: "external_agent_not_verified",
      sourceType: input.sourceType,
      externalEndpointUrl: input.endpoint
    }
  });
  return {
    status: "blocked",
    intent: "blocked",
    reply: `${input.agent.name} is waiting for marketplace verification before it can run.`,
    reason: "External helpers must be verified before runtime access is allowed.",
    runtimeState: "blocked",
    nextStep: "Use a verified helper, or wait for moderator verification before running this one.",
    externalRuntime: {
      source: "external_agent_runtime",
      sourceType: input.sourceType,
      proxyStatus: "blocked",
      blockedReason: "external_agent_not_verified"
    }
  };
}

async function executeExternalProxy(input: {
  userId: string;
  agent: RuntimeAgent;
  sourceType: ExternalSourceType;
  protocol?: AgentCapabilityManifest["protocol"];
  endpointUrl?: string;
  intent: RuntimeIntent;
  message: string;
  actionName?: string;
  usedSchemas?: string[];
  documents?: unknown[];
  requestId?: string;
}): Promise<RuntimeResult> {
  const result = await runExternalRuntimeProxy({
    agentId: input.agent.id,
    agentName: input.agent.name,
    sourceType: input.sourceType,
    protocol: input.protocol,
    endpointUrl: input.endpointUrl,
    intent: input.intent,
    message: input.message,
    actionName: input.actionName,
    usedSchemas: input.usedSchemas,
    documents: input.documents as Array<{ title?: string; excerpt?: string; vaultSchema?: { name?: string } | null }> | undefined
  });
  await writeActivityLog({
    userId: input.userId,
    agentId: input.agent.id,
    actionType: input.intent === "search" ? "api_callback" : "execution_triggered",
    status: result.status === "ok" ? "success" : result.status === "blocked" ? "blocked_by_policy" : "error",
    dataAccessed: input.actionName ?? input.usedSchemas?.join(", ") ?? input.sourceType,
    dynamicMetadata: {
      source: "external_agent_runtime",
      sourceType: input.sourceType,
      endpointHost: result.endpointHost,
      providerStatus: result.providerStatus,
      proxyStatus: result.sanitizedMetadata.proxyStatus,
      durationMs: result.durationMs,
      blockedReason: result.blockedReason,
      actionName: input.actionName,
      usedSchemas: input.usedSchemas,
      requestId: input.requestId,
      ...result.sanitizedMetadata
    }
  });
  return {
    status: result.status === "ok" ? "ok" : "blocked",
    intent: input.intent,
    reply: result.status === "ok"
      ? result.reply
      : `${input.agent.name} could not run the ${sourceLabel(input.sourceType)}. ${result.reply}`,
    reason: result.blockedReason,
    runtimeState: result.status === "ok" ? "ready" : "blocked",
    nextStep: result.status === "ok"
      ? "Review the external helper response and the receipt for what was shared."
      : "Check the receipt details before trying this external helper again.",
    actionName: input.actionName,
    usedSchemas: input.usedSchemas,
    documents: input.documents,
    requestId: input.requestId,
    externalRuntime: {
      source: "external_agent_runtime",
      sourceType: input.sourceType,
      endpointHost: result.endpointHost,
      proxyStatus: result.sanitizedMetadata.proxyStatus === "executed"
        || result.sanitizedMetadata.proxyStatus === "blocked"
        || result.sanitizedMetadata.proxyStatus === "timed_out"
        || result.sanitizedMetadata.proxyStatus === "failed"
        ? result.sanitizedMetadata.proxyStatus
        : result.status === "ok" ? "executed" : "blocked",
      durationMs: result.durationMs,
      blockedReason: result.blockedReason
    }
  };
}

export async function runExternalAgentRuntime(input: {
  userId: string;
  agent: RuntimeAgent;
  manifest: AgentCapabilityManifest;
  tools: Set<string>;
  intent: RuntimeIntent;
  message: string;
}): Promise<RuntimeResult | null> {
  const sourceType = input.manifest.sourceType ?? "native";
  if (!isExternalSource(sourceType)) return null;

  if (input.manifest.verificationStatus !== "verified") {
    return blockUnverifiedExternal({
      userId: input.userId,
      agent: input.agent,
      sourceType,
      endpoint: input.manifest.externalEndpointUrl
    });
  }

  if (isContinueApprovedActionMessage(input.message)) {
    const continuation = await consumeApprovedHitlRequest({
      userId: input.userId,
      agentId: input.agent.id,
      missingReply: `${input.agent.name} could not find an approved external action to continue.`,
      missingReason: "No unused, unexpired approval request was found for this external helper.",
      usedReply: `${input.agent.name} could not continue that external approval because it was already used or expired.`
    });
    if (continuation.status === "blocked") return continuation.result;
    const approvedRequest = continuation.request;
    return executeExternalProxy({
      userId: input.userId,
      agent: input.agent,
      sourceType,
      protocol: input.manifest.protocol,
      endpointUrl: input.manifest.externalEndpointUrl,
      intent: "action",
      message: input.message,
      actionName: approvedRequest.actionName,
      requestId: approvedRequest.id
    });
  }

  if (input.intent === "search") {
    if (!input.tools.has("vault.search")) {
      return {
        status: "blocked",
        intent: input.intent,
        reply: `${input.agent.name} cannot search personal info because that tool is not enabled.`,
        reason: "vault.search is not enabled for this external helper.",
        runtimeState: "blocked",
        nextStep: "Choose a helper that requests personal info search, or update the helper manifest.",
        externalRuntime: {
          source: "external_agent_runtime",
          sourceType,
          proxyStatus: "blocked",
          blockedReason: "external_tool_not_enabled"
        }
      };
    }

    const allowedSchemas = await getAllowedVaultSchemas({
      userId: input.userId,
      agentId: input.agent.id,
      requestedSchemas: input.manifest.requestedSchemas ?? []
    });
    if (!allowedSchemas.length) {
      const decision = await evaluateVaultPermission({
        userId: input.userId,
        agentId: input.agent.id,
        permissionType: "read"
      });
      await logDecision({
        userId: input.userId,
        agentId: input.agent.id,
        actionType: "vault_read",
        decision,
        dataAccessed: "external-agent-runtime-search",
        metadata: {
          message: input.message,
          source: "external_agent_runtime",
          sourceType,
          externalEndpointUrl: input.manifest.externalEndpointUrl
        }
      });
      return {
        status: "blocked",
        intent: input.intent,
        reply: `${input.agent.name} needs permission before it can use your personal info.`,
        reason: decision.reason,
        runtimeState: "needs_permission",
        nextStep: "Review and allow the requested private info for this external helper.",
        missingPermissions: input.manifest.requestedSchemas ?? [],
        externalRuntime: {
          source: "external_agent_runtime",
          sourceType,
          proxyStatus: "blocked",
          blockedReason: "missing_private_info_permission"
        }
      };
    }

    const documents = (await Promise.all(
      allowedSchemas.map((schema) => searchVaultDocuments(input.userId, input.message, schema.id))
    ))
      .flat()
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    await logDecision({
      userId: input.userId,
      agentId: input.agent.id,
      actionType: "vault_read",
      decision: { allowed: true, reason: "External helper runtime received only locally approved private info categories." },
      dataAccessed: "external-agent-runtime-search",
      metadata: {
        message: input.message,
        source: "external_agent_runtime",
        sourceType,
        externalEndpointUrl: input.manifest.externalEndpointUrl,
        proxyStatus: "prepared",
        schemaIds: allowedSchemas.map((schema) => schema.id)
      }
    });

    return executeExternalProxy({
      userId: input.userId,
      agent: input.agent,
      sourceType,
      protocol: input.manifest.protocol,
      endpointUrl: input.manifest.externalEndpointUrl,
      intent: input.intent,
      message: input.message,
      usedSchemas: allowedSchemas.map((schema) => schema.name),
      documents: documents.map(serializeVaultDocument)
    });
  }

  if (input.intent === "action") {
    if (!input.tools.has("action.execute")) {
      return {
        status: "blocked",
        intent: input.intent,
        reply: `${input.agent.name} cannot take actions. It can only help with information lookup.`,
        reason: "action.execute is not enabled for this external helper.",
        runtimeState: "blocked",
        nextStep: "Use this helper for questions only, or choose an action-capable helper.",
        externalRuntime: {
          source: "external_agent_runtime",
          sourceType,
          proxyStatus: "blocked",
          blockedReason: "external_tool_not_enabled"
        }
      };
    }

    const actionName = getRequestedAction(input.message, input.manifest.highRiskActions ?? []);
    if (isHighRiskAction(actionName) || (input.manifest.highRiskActions ?? []).includes(actionName)) {
      const request = await createHitlRequest({
        userId: input.userId,
        agentId: input.agent.id,
        actionName,
        payload: {
          message: input.message,
          source: "external_agent_runtime",
          sourceType,
          externalEndpointUrl: input.manifest.externalEndpointUrl,
          proxyStatus: "pending_human_approval"
        }
      });
      return {
        status: "awaiting_human_approval",
        intent: input.intent,
        reply: `${input.agent.name} paused this external action and sent it to you for approval.`,
        runtimeState: "needs_approval",
        nextStep: "Approve or deny this action before any external helper can continue.",
        actionName,
        requestId: request.id,
        externalRuntime: {
          source: "external_agent_runtime",
          sourceType,
          proxyStatus: "pending_human_approval"
        }
      };
    }

    const decision = await evaluateVaultPermission({
      userId: input.userId,
      agentId: input.agent.id,
      permissionType: "execute_action"
    });
    if (!decision.allowed) {
      await logDecision({
        userId: input.userId,
        agentId: input.agent.id,
        actionType: "execution_triggered",
        decision,
        dataAccessed: actionName,
        metadata: {
          message: input.message,
          source: "external_agent_runtime",
          sourceType,
          externalEndpointUrl: input.manifest.externalEndpointUrl,
          proxyStatus: "blocked"
        }
      });
      return {
        status: "blocked",
        intent: input.intent,
        reply: `${input.agent.name} is not allowed to do that yet.`,
        reason: decision.reason,
        actionName,
        runtimeState: "blocked",
        nextStep: "Review this external helper's action permissions before trying again.",
        externalRuntime: {
          source: "external_agent_runtime",
          sourceType,
          proxyStatus: "blocked",
          blockedReason: "missing_action_permission"
        }
      };
    }

    return executeExternalProxy({
      userId: input.userId,
      agent: input.agent,
      sourceType,
      protocol: input.manifest.protocol,
      endpointUrl: input.manifest.externalEndpointUrl,
      intent: input.intent,
      message: input.message,
      actionName
    });
  }

  return {
    status: "blocked",
    intent: input.intent,
    reply: "Please ask a clear question or action.",
    reason: "Empty message.",
    runtimeState: "blocked",
    nextStep: "Type a question or an action request for this external helper.",
    externalRuntime: isExternalSource(sourceType) ? {
      source: "external_agent_runtime",
      sourceType,
      proxyStatus: "blocked",
      blockedReason: "empty_message"
    } : undefined
  };
}
