import type { AgentRunStatus, AgentRunStepType, ToolRunStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { encodeJson } from "./jsonService.js";

export async function startAgentRun(input: {
  userId: string;
  agentId: string;
  conversationId?: string;
  intent: string;
  userGoal: string;
  plan?: Record<string, unknown>;
}) {
  return prisma.agentRun.create({
    data: {
      userId: input.userId,
      agentId: input.agentId,
      conversationId: input.conversationId,
      status: "running",
      intent: input.intent,
      userGoal: input.userGoal,
      plan: encodeJson(input.plan ?? {})
    }
  });
}

export async function recordAgentRunStep(input: {
  agentRunId: string;
  stepType: AgentRunStepType;
  status: ToolRunStatus;
  title: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  toolRunId?: string;
}) {
  return prisma.agentRunStep.create({
    data: {
      agentRunId: input.agentRunId,
      stepType: input.stepType,
      status: input.status,
      title: input.title,
      input: encodeJson(input.input ?? {}),
      output: encodeJson(input.output ?? {}),
      error: input.error,
      toolRunId: input.toolRunId,
      completedAt: ["succeeded", "failed", "blocked", "cancelled"].includes(input.status) ? new Date() : undefined
    }
  });
}

export async function finishAgentRun(input: {
  agentRunId: string;
  status: AgentRunStatus;
  result?: Record<string, unknown>;
  error?: string;
}) {
  return prisma.agentRun.update({
    where: { id: input.agentRunId },
    data: {
      status: input.status,
      result: encodeJson(input.result ?? {}),
      error: input.error,
      completedAt: ["succeeded", "failed", "blocked", "cancelled"].includes(input.status) ? new Date() : undefined
    }
  });
}

export function runtimeStatusToAgentRunStatus(status: "ok" | "blocked" | "awaiting_human_approval") {
  if (status === "ok") return "succeeded" as const;
  if (status === "awaiting_human_approval") return "waiting_for_approval" as const;
  return "blocked" as const;
}
