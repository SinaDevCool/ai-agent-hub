import type { RiskLevel } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { createHitlRequest } from "./hitlService.js";
import { encodeJson } from "./jsonService.js";
import { createProviderReceipt, type CreateProviderReceiptInput } from "./providerReceiptService.js";
import type { ToolBlockDetails, ToolExecutionResult } from "./tools/toolExecutionTypes.js";

export type ProviderRunInput = {
  userId: string;
  agentId: string;
  agentRunId?: string;
  toolName: string;
  input: Record<string, unknown>;
  riskLevel?: RiskLevel;
  requiresApproval?: boolean;
  idempotencyKey?: string;
};

export async function findExistingProviderRun(input: { userId: string; idempotencyKey?: string }) {
  if (!input.idempotencyKey) return null;
  return prisma.toolRun.findUnique({
    where: {
      userId_idempotencyKey: {
        userId: input.userId,
        idempotencyKey: input.idempotencyKey
      }
    }
  });
}

export function providerRunResultFromExisting(run: Awaited<ReturnType<typeof findExistingProviderRun>>): ToolExecutionResult | null {
  if (!run) return null;
  if (run.status === "waiting_for_approval" && run.hitlRequestId) {
    return { status: "awaiting_human_approval", toolRunId: run.id, requestId: run.hitlRequestId };
  }
  if (run.status === "succeeded") {
    return { status: "ok", toolRunId: run.id, result: JSON.parse(run.result || "{}") as Record<string, unknown> };
  }
  if (run.status === "blocked" || run.status === "failed") {
    const result = JSON.parse(run.result || "{}") as Partial<ToolBlockDetails>;
    return {
      status: "blocked",
      toolRunId: run.id,
      reason: run.error ?? result.userMessage ?? "This provider did not complete.",
      ...result
    };
  }
  return null;
}

export async function startProviderRun(input: ProviderRunInput) {
  const existing = providerRunResultFromExisting(await findExistingProviderRun({
    userId: input.userId,
    idempotencyKey: input.idempotencyKey
  }));
  if (existing) return { existing, toolRun: null };

  const toolRun = await prisma.toolRun.create({
    data: {
      userId: input.userId,
      agentId: input.agentId,
      agentRunId: input.agentRunId,
      toolName: input.toolName,
      input: encodeJson(input.input),
      status: "running",
      riskLevel: input.riskLevel ?? "high",
      requiresApproval: Boolean(input.requiresApproval),
      idempotencyKey: input.idempotencyKey,
      startedAt: new Date()
    }
  });
  return { existing: null, toolRun };
}

export async function markProviderRunWaiting(input: { toolRunId: string; requestId: string }) {
  await prisma.toolRun.update({
    where: { id: input.toolRunId },
    data: {
      status: "waiting_for_approval",
      hitlRequestId: input.requestId
    }
  });
  return { status: "awaiting_human_approval" as const, toolRunId: input.toolRunId, requestId: input.requestId };
}

export async function markProviderRunSucceeded(input: { toolRunId: string; result?: Record<string, unknown> }) {
  await prisma.toolRun.update({
    where: { id: input.toolRunId },
    data: {
      status: "succeeded",
      result: encodeJson(input.result ?? {}),
      completedAt: new Date()
    }
  });
  return { status: "ok" as const, toolRunId: input.toolRunId, result: input.result ?? {} };
}

export async function markProviderRunBlocked(input: { toolRunId: string; reason?: string } & Partial<ToolBlockDetails>) {
  const userMessage = input.userMessage ?? input.reason ?? "This provider did not complete.";
  await prisma.toolRun.update({
    where: { id: input.toolRunId },
    data: {
      status: "blocked",
      error: userMessage,
      result: encodeJson({
        code: input.code,
        userMessage,
        technicalMessage: input.technicalMessage,
        nextAction: input.nextAction,
        retryable: input.retryable
      }),
      completedAt: new Date()
    }
  });
  return {
    status: "blocked" as const,
    toolRunId: input.toolRunId,
    reason: userMessage,
    code: input.code,
    userMessage,
    technicalMessage: input.technicalMessage,
    nextAction: input.nextAction,
    retryable: input.retryable
  };
}

export async function markProviderRunFailed(input: { toolRunId: string; reason: string }) {
  await prisma.toolRun.update({
    where: { id: input.toolRunId },
    data: {
      status: "failed",
      error: input.reason,
      completedAt: new Date()
    }
  });
  return {
    status: "blocked" as const,
    toolRunId: input.toolRunId,
    reason: input.reason,
    code: "execution_failed" as const,
    userMessage: input.reason,
    retryable: true,
    nextAction: "try_again" as const
  };
}

export async function requestProviderRunApproval(input: ProviderRunInput & {
  providerId: string;
  providerLabel: string;
  capabilityKey: string;
  capabilityLabel: string;
  action: string;
  values: Record<string, unknown>;
}) {
  const started = await startProviderRun({
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
    riskLevel: input.riskLevel ?? "high",
    requiresApproval: true,
    idempotencyKey: input.idempotencyKey
  });
  if (started.existing?.status === "awaiting_human_approval") {
    return { toolRunId: started.existing.toolRunId, requestId: started.existing.requestId, reused: true };
  }
  if (started.existing) {
    throw new Error("Provider approval run already completed for this idempotency key.");
  }
  if (!started.toolRun) throw new Error("Provider approval run was not created.");

  const request = await createHitlRequest({
    userId: input.userId,
    agentId: input.agentId,
    actionName: `${input.providerId}.${input.action}`,
    payload: {
      toolRunId: started.toolRun.id,
      toolName: input.toolName,
      providerId: input.providerId,
      connectorProviderId: input.providerId,
      providerLabel: input.providerLabel,
      capabilityKey: input.capabilityKey,
      capabilityLabel: input.capabilityLabel,
      action: input.action,
      agentRunId: input.agentRunId,
      executionMode: "provider_schema_approval_gate",
      arguments: {
        ...input.values,
        capabilityKey: input.capabilityKey,
        connectorAction: input.action,
        connectorProviderId: input.providerId
      }
    }
  });
  await markProviderRunWaiting({ toolRunId: started.toolRun.id, requestId: request.id });
  return { toolRunId: started.toolRun.id, requestId: request.id, reused: false };
}

export async function recordProviderRunReceipt(input: CreateProviderReceiptInput) {
  return createProviderReceipt(input);
}

export async function appendProviderRunTrace(input: {
  userId: string;
  agentId: string;
  agentRunId?: string;
  provider: string;
  model?: string;
  event: string;
  inputSummary?: string;
  outputSummary?: string;
  toolCalls?: unknown[];
  latencyMs?: number;
  failureReason?: string;
}) {
  return prisma.agentTrace.create({
    data: {
      userId: input.userId,
      agentId: input.agentId,
      agentRunId: input.agentRunId,
      provider: input.provider,
      model: input.model ?? input.event,
      inputSummary: input.inputSummary ?? "",
      outputSummary: input.outputSummary ?? "",
      toolCalls: encodeJson(input.toolCalls ?? []),
      latencyMs: input.latencyMs ?? 0,
      tokenUsage: encodeJson({}),
      costUsd: 0,
      failureReason: input.failureReason
    }
  });
}
