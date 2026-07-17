import { prisma } from "../db/prisma.js";
import { encodeJson } from "./jsonService.js";
import { createHitlRequest } from "./hitlService.js";
import { evaluateToolExecutionPolicy, normalizeToolBlock } from "./toolExecutionPolicyService.js";
import { getToolDefinition } from "./toolRegistryService.js";
import { getAdapterForTool } from "./tools/adapterRegistry.js";
import type { AdapterExecutionResult, ToolBlockDetails, ToolExecutionInput, ToolExecutionResult } from "./tools/toolExecutionTypes.js";

export type { ToolExecutionInput, ToolExecutionResult } from "./tools/toolExecutionTypes.js";

async function findExistingRun(input: ToolExecutionInput) {
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

function resultFromExisting(run: Awaited<ReturnType<typeof findExistingRun>>): ToolExecutionResult | null {
  if (!run) return null;
  if (run.status === "waiting_for_approval" && run.hitlRequestId) {
    return { status: "awaiting_human_approval", toolRunId: run.id, requestId: run.hitlRequestId };
  }
  if (run.status === "succeeded") {
    const result = JSON.parse(run.result || "{}") as Record<string, unknown>;
    const documents = Array.isArray(result.documents) ? result.documents : undefined;
    const actionName = typeof result.actionName === "string" ? result.actionName : undefined;
    return { status: "ok", toolRunId: run.id, result, documents, actionName };
  }
  if (run.status === "blocked" || run.status === "failed") {
    const reason = run.error ?? "This tool run did not complete.";
    return { status: "blocked", toolRunId: run.id, reason, ...normalizeToolBlock({ reason }) };
  }
  return null;
}

async function markBlocked(toolRunId: string, reason: string, details?: Partial<ToolBlockDetails>) {
  const normalized = normalizeToolBlock({ reason, ...details });
  await prisma.toolRun.update({
    where: { id: toolRunId },
    data: {
      status: "blocked",
      error: normalized.userMessage,
      result: encodeJson({
        code: normalized.code,
        userMessage: normalized.userMessage,
        technicalMessage: normalized.technicalMessage,
        nextAction: normalized.nextAction,
        retryable: normalized.retryable
      }),
      completedAt: new Date()
    }
  });
  return { status: "blocked" as const, toolRunId, reason: normalized.userMessage, ...normalized };
}

async function markSucceeded(toolRunId: string, adapterResult: Extract<AdapterExecutionResult, { status: "ok" }>) {
  const result = {
    ...(adapterResult.result ?? {}),
    ...(adapterResult.documents ? { documents: adapterResult.documents } : {}),
    ...(adapterResult.actionName ? { actionName: adapterResult.actionName } : {})
  };
  await prisma.toolRun.update({
    where: { id: toolRunId },
    data: {
      status: "succeeded",
      result: encodeJson(result),
      completedAt: new Date()
    }
  });
  return {
    status: "ok" as const,
    toolRunId,
    result,
    documents: adapterResult.documents,
    actionName: adapterResult.actionName
  };
}

async function markWaitingForApproval(toolRunId: string, requestId: string) {
  await prisma.toolRun.update({
    where: { id: toolRunId },
    data: {
      status: "waiting_for_approval",
      hitlRequestId: requestId
    }
  });
  return { status: "awaiting_human_approval" as const, toolRunId, requestId };
}

export async function executeTool(input: ToolExecutionInput): Promise<ToolExecutionResult> {
  const existing = resultFromExisting(await findExistingRun(input));
  if (existing) return existing;

  const definition = getToolDefinition(input.toolName);
  const toolRun = await prisma.toolRun.create({
    data: {
      userId: input.userId,
      agentId: input.agentId,
      agentRunId: input.agentRunId,
      toolName: input.toolName,
      input: encodeJson(input.arguments),
      status: "running",
      riskLevel: definition?.riskLevel ?? "high",
      requiresApproval: definition?.requiresApproval ?? true,
      idempotencyKey: input.idempotencyKey,
      startedAt: new Date()
    }
  });

  try {
    const policy = await evaluateToolExecutionPolicy({ definition, execution: input });
    if (policy.status === "blocked") {
      return markBlocked(toolRun.id, policy.details.userMessage, policy.details);
    }
    if (policy.status === "approval_required") {
      const request = await createHitlRequest({
        userId: input.userId,
        agentId: input.agentId,
        actionName: policy.actionName,
        payload: {
          toolRunId: toolRun.id,
          toolName: input.toolName,
          arguments: input.arguments,
          agentRunId: input.agentRunId,
          executionMode: "tool_approval_gate"
        }
      });
      return markWaitingForApproval(toolRun.id, request.id);
    }
    if (!definition) return markBlocked(toolRun.id, `Unknown tool '${input.toolName}'.`);

    const adapter = getAdapterForTool(definition);
    const adapterResult = await adapter.execute({
      ...input,
      toolRunId: toolRun.id,
      definition
    });

    if (adapterResult.status === "ok") return markSucceeded(toolRun.id, adapterResult);
    if (adapterResult.status === "awaiting_human_approval") return markWaitingForApproval(toolRun.id, adapterResult.requestId);
    return markBlocked(toolRun.id, adapterResult.reason, adapterResult);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Tool execution failed.";
    await prisma.toolRun.update({
      where: { id: toolRun.id },
      data: {
        status: "failed",
        error: reason,
        completedAt: new Date()
      }
    });
    const normalized = normalizeToolBlock({ reason });
    return { status: "blocked", toolRunId: toolRun.id, reason: normalized.userMessage, ...normalized };
  }
}
