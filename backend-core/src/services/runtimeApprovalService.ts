import type { HitlRequest } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { RuntimeResult } from "./agentRuntimeTypes.js";
import { getConnectorCapability, type ConnectorAction } from "./connectorCapabilityService.js";
import { executeConnector, type ConnectorExecutionResult } from "./connectorExecutionService.js";
import { resolveConnectorProvider } from "./connectorProviderRegistryService.js";
import { decodeJson } from "./jsonService.js";
import { createProviderReceipt } from "./providerReceiptService.js";
import { markProviderRunBlocked, markProviderRunSucceeded } from "./providerRunService.js";
import { executeTool, type ToolExecutionResult } from "./toolExecutionService.js";
import { verifyConnectorState } from "./cryptoService.js";

export function isContinueApprovedActionMessage(message: string) {
  return /^continue the approved action:/i.test(message) || /^continue approved action:/i.test(message);
}

export type ApprovedActionContinuation =
  | { status: "ready"; request: HitlRequest }
  | { status: "blocked"; result: RuntimeResult };

type ApprovedToolPayload = {
  toolRunId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  agentRunId?: string;
  executionMode?: string;
  approvalBinding?: string;
};

export type ApprovedToolResumeResult =
  | { status: "resumed"; result: ToolExecutionResult; payload: ApprovedToolPayload }
  | { status: "blocked"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isConnectorAction(value: unknown): value is ConnectorAction {
  return value === "search"
    || value === "quote"
    || value === "reserve"
    || value === "prepare_action"
    || value === "execute_action"
    || value === "sync_status"
    || value === "status"
    || value === "cancel";
}

function connectorResultToToolResult(result: ConnectorExecutionResult, fallbackToolRunId: string): ToolExecutionResult {
  if (result.status === "ok") {
    return {
      status: "ok",
      toolRunId: result.toolRunId,
      result: {
        providerId: result.providerId,
        providerLabel: result.providerLabel,
        connectorResult: result.result,
        rawResult: result.rawResult
      }
    };
  }
  if (result.status === "awaiting_human_approval") {
    return result;
  }
  return {
    status: "blocked",
    toolRunId: result.toolRunId ?? fallbackToolRunId,
    reason: result.reason,
    code: result.code,
    userMessage: result.userMessage,
    technicalMessage: result.technicalMessage,
    nextAction: result.nextAction,
    retryable: result.retryable
  };
}

async function closeApprovalGateRun(input: { payload: ApprovedToolPayload; result: ToolExecutionResult }) {
  if (!input.payload.toolRunId || input.payload.toolRunId === input.result.toolRunId) return;
  if (input.result.status === "ok") {
    await markProviderRunSucceeded({
      toolRunId: input.payload.toolRunId,
      result: input.result.result ?? {}
    });
    return;
  }
  if (input.result.status === "blocked") {
    await markProviderRunBlocked({
      toolRunId: input.payload.toolRunId,
      reason: input.result.reason,
      code: input.result.code,
      userMessage: input.result.userMessage ?? input.result.reason,
      technicalMessage: input.result.technicalMessage,
      nextAction: input.result.nextAction,
      retryable: input.result.retryable
    });
  }
}

export function parseApprovedToolPayload(payload: string): ApprovedToolPayload | null {
  const decoded = decodeJson<unknown>(payload, null);
  if (!isRecord(decoded)) return null;
  const toolName = typeof decoded.toolName === "string" ? decoded.toolName.trim() : "";
  const args = decoded.arguments;
  if (!toolName || !isRecord(args)) return null;
  const approvalBinding = typeof decoded.approvalBinding === "string" ? decoded.approvalBinding : "";
  const verified = approvalBinding ? verifyConnectorState<Record<string, unknown>>(approvalBinding) : null;
  if (!verified) return null;
  const unsignedPayload = { ...decoded };
  delete unsignedPayload.approvalBinding;
  if (JSON.stringify(verified) !== JSON.stringify(unsignedPayload)) return null;
  return {
    toolRunId: typeof decoded.toolRunId === "string" ? decoded.toolRunId : undefined,
    toolName,
    arguments: args,
    agentRunId: typeof decoded.agentRunId === "string" ? decoded.agentRunId : undefined,
    executionMode: typeof decoded.executionMode === "string" ? decoded.executionMode : undefined,
    approvalBinding
  };
}

export async function consumeApprovedHitlRequest(input: {
  userId: string;
  agentId: string;
  missingReply: string;
  missingReason: string;
  usedReply: string;
}): Promise<ApprovedActionContinuation> {
  const approvedRequest = await prisma.hitlRequest.findFirst({
    where: {
      userId: input.userId,
      agentId: input.agentId,
      status: "success",
      expiresAt: { gt: new Date() },
      continuedAt: null
    },
    orderBy: { decidedAt: "desc" }
  });
  if (!approvedRequest) {
    return {
      status: "blocked",
      result: {
        status: "blocked",
        intent: "action",
        reply: input.missingReply,
        reason: input.missingReason,
        runtimeState: "blocked",
        nextStep: "Approve the paused action first, then continue it before the approval expires."
      }
    };
  }

  const consumed = await prisma.hitlRequest.updateMany({
    where: {
      id: approvedRequest.id,
      userId: input.userId,
      status: "success",
      expiresAt: { gt: new Date() },
      continuedAt: null
    },
    data: { continuedAt: new Date() }
  });
  if (consumed.count === 0) {
    return {
      status: "blocked",
      result: {
        status: "blocked",
        intent: "action",
        reply: input.usedReply,
        reason: "The approved action was already continued or expired.",
        runtimeState: "blocked",
        nextStep: "Create a fresh approval request if you still want this action."
      }
    };
  }

  return { status: "ready", request: approvedRequest };
}

export async function resumeApprovedToolRequest(input: {
  request: HitlRequest;
  agentRunId?: string;
}): Promise<ApprovedToolResumeResult> {
  const payload = parseApprovedToolPayload(input.request.payload);
  if (!payload) {
    return {
      status: "blocked",
      reason: "This approval was created before tool resume support and cannot be continued safely."
    };
  }

  if (payload.executionMode === "provider_schema_approval_gate") {
    const capabilityKey = typeof payload.arguments.capabilityKey === "string" ? payload.arguments.capabilityKey : undefined;
    const connectorProviderId = typeof payload.arguments.connectorProviderId === "string" ? payload.arguments.connectorProviderId : undefined;
    const connectorActionValue = payload.arguments.connectorAction;
    if (!capabilityKey || !connectorProviderId || !isConnectorAction(connectorActionValue)) {
      return {
        status: "blocked",
        reason: "This provider approval is missing the provider action details needed to continue safely."
      };
    }
    const connectorResult = await executeConnector({
      userId: input.request.userId,
      agentId: input.request.agentId,
      agentRunId: input.agentRunId ?? payload.agentRunId,
      capabilityKey,
      action: connectorActionValue,
      preferredProviderId: connectorProviderId,
      input: payload.arguments,
      idempotencyKey: `approved-hitl:${input.request.id}`,
      approvalOverride: { hitlRequestId: input.request.id }
    });
    const result = connectorResultToToolResult(connectorResult, payload.toolRunId ?? input.request.id);
    await closeApprovalGateRun({ payload, result });
    return { status: "resumed", result, payload };
  }

  const result = await executeTool({
    userId: input.request.userId,
    agentId: input.request.agentId,
    agentRunId: input.agentRunId ?? payload.agentRunId,
    toolName: payload.toolName,
    arguments: payload.arguments,
    idempotencyKey: `approved-hitl:${input.request.id}`,
    approvalOverride: { hitlRequestId: input.request.id }
  });

  const capabilityKey = typeof payload.arguments.capabilityKey === "string" ? payload.arguments.capabilityKey : undefined;
  const connectorProviderId = typeof payload.arguments.connectorProviderId === "string" ? payload.arguments.connectorProviderId : undefined;
  const connectorAction = typeof payload.arguments.connectorAction === "string" ? payload.arguments.connectorAction : undefined;
  const capability = getConnectorCapability(capabilityKey);
  const provider = capability && connectorProviderId
    ? resolveConnectorProvider({
        capabilityKey: capability.canonicalKey,
        action: connectorAction === "execute_action" ? "execute_action" : undefined,
        preferredProviderId: connectorProviderId
      })
    : null;
  if (capability && provider) {
    if (result.status === "ok") {
      await createProviderReceipt({
        userId: input.request.userId,
        agentId: input.request.agentId,
        agentRunId: input.agentRunId ?? payload.agentRunId,
        toolRunId: result.toolRunId,
        providerId: provider.providerId,
        providerLabel: provider.label,
        capabilityKey: capability.canonicalKey,
        capabilityLabel: capability.label,
        action: connectorAction ?? "execute_action",
        status: "succeeded",
        approvalRequired: true,
        hitlRequestId: input.request.id,
        userMessage: `${capability.label} completed after your approval.`,
        itemCount: 0,
        metadata: { toolName: payload.toolName, approvedToolRunId: payload.toolRunId }
      });
    } else if (result.status === "blocked") {
      await createProviderReceipt({
        userId: input.request.userId,
        agentId: input.request.agentId,
        agentRunId: input.agentRunId ?? payload.agentRunId,
        toolRunId: result.toolRunId,
        providerId: provider.providerId,
        providerLabel: provider.label,
        capabilityKey: capability.canonicalKey,
        capabilityLabel: capability.label,
        action: connectorAction ?? "execute_action",
        status: "blocked",
        approvalRequired: true,
        hitlRequestId: input.request.id,
        userMessage: result.userMessage ?? result.reason,
        technicalMessage: result.technicalMessage,
        retryable: result.retryable,
        nextAction: result.nextAction,
        metadata: { toolName: payload.toolName, approvedToolRunId: payload.toolRunId, code: result.code }
      });
    }
  }

  return { status: "resumed", result, payload };
}
