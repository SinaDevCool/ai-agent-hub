import type { AgentCapabilityManifest, RuntimeAgent, RuntimeBranchResult, RuntimeResult } from "./agentRuntimeTypes.js";
import { getRequestedAction } from "./runtimeIntentService.js";
import { executeTool } from "./toolExecutionService.js";

export async function runActionIntent(input: {
  userId: string;
  agent: RuntimeAgent;
  agentRunId: string;
  message: string;
  manifest: AgentCapabilityManifest;
  tools: Set<string>;
}): Promise<RuntimeBranchResult> {
  if (!input.tools.has("action.execute")) {
    const result: RuntimeResult = {
      status: "blocked",
      intent: "action",
      reply: `${input.agent.name} cannot take actions. It can only help with information lookup.`,
      reason: "action.execute is not enabled for this agent.",
      runtimeState: "blocked",
      nextStep: "Use this agent for questions only, or add an action-capable agent."
    };
    return {
      result,
      step: {
        title: "Check action capability",
        input: { toolName: "action.execute" },
        error: "action.execute is not enabled for this agent."
      }
    };
  }

  const actionName = getRequestedAction(input.message, input.manifest.highRiskActions ?? []);
  const actionResult = await executeTool({
    userId: input.userId,
    agentId: input.agent.id,
    agentRunId: input.agentRunId,
    toolName: "action.execute",
    arguments: { actionName, message: input.message, source: "agent_runtime" }
  });
  if (actionResult.status === "awaiting_human_approval") {
    const result: RuntimeResult = {
      status: "awaiting_human_approval",
      intent: "action",
      reply: `${input.agent.name} paused this action and sent it to you for approval.`,
      runtimeState: "needs_approval",
      nextStep: "Approve or deny this action before the agent continues.",
      actionName,
      requestId: actionResult.requestId
    };
    return {
      result,
      step: {
        title: "Request approval",
        toolRunId: actionResult.toolRunId,
        input: { actionName, message: input.message },
        output: { requestId: actionResult.requestId }
      }
    };
  }
  const result = actionResult.status === "ok"
    ? {
      status: "ok" as const,
      intent: "action" as const,
      reply: `${input.agent.name} completed the allowed action: ${actionName.replace(/_/g, " ")}.`,
      actionName,
      runtimeState: "ready" as const,
      nextStep: "Check the activity log for the recorded action."
    }
    : {
      status: "blocked" as const,
      intent: "action" as const,
      reply: `${input.agent.name} is not allowed to do that yet.`,
      reason: actionResult.reason,
      actionName,
      runtimeState: "blocked" as const,
      nextStep: "Review this agent's action permissions before trying again."
    };
  return {
    result,
    step: {
      title: "Execute action",
      toolRunId: actionResult.toolRunId,
      input: { actionName, message: input.message },
      output: actionResult.status === "ok" ? { actionName } : undefined,
      error: actionResult.status === "blocked" ? actionResult.reason : undefined
    }
  };
}
