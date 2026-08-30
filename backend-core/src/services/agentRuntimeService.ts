import { prisma } from "../db/prisma.js";
import type { AgentCapabilityManifest, RuntimeAgent, RuntimeResult, RuntimeStep } from "./agentRuntimeTypes.js";
import { runActionIntent } from "./agentActionRuntimeService.js";
import { getActiveImportedRuntimeProvider, importedRuntimeNeedsActivation } from "./agentRuntimeActivationService.js";
import { isContinueApprovedActionMessage, runApprovalContinuation } from "./agentApprovalRuntimeService.js";
import {
  getOrCreateAgentConversation,
  withPersistedConversation
} from "./agentConversationRuntimeService.js";
import { runConnectorToolIntent } from "./agentConnectorToolRuntimeService.js";
import { runExternalAgentRuntime } from "./externalAgentRuntimeService.js";
import { decodeJson } from "./jsonService.js";
import { runProviderRuntimeIntent } from "./agentProviderRuntimeService.js";
import { finishAgentRun, recordAgentRunStep, runtimeStatusToAgentRunStatus, startAgentRun } from "./agentRunService.js";
import { getRuntimeIntent } from "./runtimeIntentService.js";
import { runVaultSearchIntent } from "./agentVaultRuntimeService.js";
import { interpretAgentMessage, interpretationExecutionMessage, validateInterpretationForManifest } from "./agentInterpretationService.js";
import type { ClientRuntimeProvenance, InterpretationResult } from "./agentInterpretationSchema.js";

export { getOrCreateAgentConversation };

async function persistRuntimeResult(input: {
  userId: string;
  agent: RuntimeAgent;
  agentRunId: string;
  message: string;
  result: RuntimeResult;
  step?: RuntimeStep;
}) {
  if (input.step) {
    await recordAgentRunStep({
      agentRunId: input.agentRunId,
      stepType: input.result.status === "awaiting_human_approval" ? "wait_for_approval" : input.result.status === "blocked" ? "request_permission" : "call_tool",
      status: input.result.status === "ok" ? "succeeded" : input.result.status === "awaiting_human_approval" ? "waiting_for_approval" : "blocked",
      title: input.step.title,
      input: input.step.input,
      output: input.step.output,
      error: input.step.error,
      toolRunId: input.step.toolRunId
    });
  }
  await finishAgentRun({
    agentRunId: input.agentRunId,
    status: runtimeStatusToAgentRunStatus(input.result.status),
    result: {
      runtimeState: input.result.runtimeState,
      actionName: input.result.actionName,
      requestId: input.result.requestId,
      provider: input.result.provider,
      model: input.result.model,
      interpretation: input.result.interpretation,
      clientRuntime: input.result.clientRuntime,
      providerReceiptId: input.result.providerReceipt?.id
    },
    error: input.result.reason
  });
  return withPersistedConversation({
    userId: input.userId,
    agent: input.agent,
    message: input.message,
    result: input.result
  });
}

export async function runAgentForUser(input: {
  userId: string;
  agentId: string;
  message?: string;
  interpretation?: InterpretationResult;
  clientRuntime?: ClientRuntimeProvenance;
}): Promise<RuntimeResult & { conversation?: unknown }> {
  const agent = await prisma.agent.findFirst({
    where: {
      id: input.agentId,
      connections: { some: { userId: input.userId } }
    }
  });
  if (!agent) {
    return {
      status: "blocked" as const,
      intent: "blocked" as const,
      reply: "This agent is not connected to your profile.",
      reason: "Agent is not connected to this user.",
      runtimeState: "blocked" as const,
      nextStep: "Add this agent to your profile before using it."
    };
  }
  const runtimeAgent: RuntimeAgent = agent;
  const manifest = decodeJson<AgentCapabilityManifest>(runtimeAgent.capabilityManifest, {});
  const tools = new Set(manifest.tools ?? []);
  const suppliedMessage = input.message?.trim() ?? "";
  const interpretation = input.interpretation ?? await interpretAgentMessage({ message: suppliedMessage, manifest });
  const validation = validateInterpretationForManifest({ interpretation, manifest });
  const message = suppliedMessage || interpretationExecutionMessage(interpretation) || "Locally interpreted request";
  if (!validation.ok) {
    const result: RuntimeResult = {
      status: "blocked",
      intent: "blocked",
      reply: validation.reason,
      reason: validation.reason,
      runtimeState: "blocked",
      nextStep: interpretation.missingFields.length ? "Provide the missing information and try again." : "Choose a capability supported by this agent.",
      interpretation,
      clientRuntime: input.clientRuntime
    };
    return withPersistedConversation({ userId: input.userId, agent: runtimeAgent, message, result });
  }
  const intent = input.interpretation ? interpretation.intent : getRuntimeIntent(message);
  const activeImportedProvider = getActiveImportedRuntimeProvider(manifest);
  const activationBlock = importedRuntimeNeedsActivation(manifest);

  if (activationBlock) {
    const nextStep = activationBlock.activationStatus === "blocked"
      ? "Choose another agent or import a safe runtime endpoint."
      : "Open this agent's setup and activate its runtime before using it.";
    const result: RuntimeResult = {
      status: "blocked",
      intent: "blocked",
      reply: `${agent.name} needs setup before it can run.`,
      reason: activationBlock.blockers[0] || activationBlock.setupSteps[0] || "Imported runtime is not active.",
      runtimeState: activationBlock.activationStatus === "failed" ? "failed" : "blocked",
      nextStep
    };
    return withPersistedConversation({ userId: input.userId, agent: runtimeAgent, message, result });
  }

  const agentRun = await startAgentRun({
    userId: input.userId,
    agentId: agent.id,
    intent,
    userGoal: message,
    plan: {
      source: input.interpretation ? "client_interpretation" : "agent_runtime",
      tools: manifest.tools ?? [],
      requestedSchemas: manifest.requestedSchemas ?? [],
      highRiskActions: manifest.highRiskActions ?? [],
      interpretation,
      clientRuntime: input.clientRuntime
    }
  });

  const persist = (result: RuntimeResult, step?: RuntimeStep) =>
    persistRuntimeResult({
      userId: input.userId,
      agent: runtimeAgent,
      agentRunId: agentRun.id,
      message,
      result: { ...result, interpretation, clientRuntime: input.clientRuntime },
      step
    });

  if (!activeImportedProvider) {
    const externalResult = await runExternalAgentRuntime({
      userId: input.userId,
      agent: runtimeAgent,
      manifest,
      tools,
      intent,
      message
    });
    if (externalResult) {
      return persist(externalResult, {
        title: "External agent runtime",
        input: { message, sourceType: manifest.sourceType },
        output: { status: externalResult.status, externalRuntime: externalResult.externalRuntime },
        error: externalResult.reason
      });
    }
  }

  if (isContinueApprovedActionMessage(message)) {
    const branch = await runApprovalContinuation({
      userId: input.userId,
      agent: runtimeAgent,
      agentRunId: agentRun.id,
      message
    });
    return persist(branch.result, branch.step);
  }

  const connectorBranch = await runConnectorToolIntent({
    userId: input.userId,
    agent: runtimeAgent,
    agentRunId: agentRun.id,
    intent,
    message,
    tools
  });
  if (connectorBranch) return persist(connectorBranch.result, connectorBranch.step);

  // Explicit action requests must reach the action permission/HITL gate before
  // a broad workflow capability inferred from words such as "hotel" or
  // "travel" can execute. Marketplace agents commonly expose both tools.
  if (intent === "action") {
    const branch = await runActionIntent({
      userId: input.userId,
      agent: runtimeAgent,
      agentRunId: agentRun.id,
      message,
      manifest,
      tools
    });
    return persist(branch.result, branch.step);
  }

  const providerBranch = await runProviderRuntimeIntent({
    userId: input.userId,
    agent: runtimeAgent,
    agentRunId: agentRun.id,
    message,
    tools,
    activeImportedProvider
  });
  if (providerBranch) return persist(providerBranch.result, providerBranch.step);

  if (intent === "search") {
    const branch = await runVaultSearchIntent({
      userId: input.userId,
      agent: runtimeAgent,
      agentRunId: agentRun.id,
      message,
      manifest,
      tools
    });
    return persist(branch.result, branch.step);
  }

  const result: RuntimeResult = {
    status: "blocked",
    intent,
    reply: "Please ask a clear question or action.",
    reason: "Empty message.",
    runtimeState: "blocked",
    nextStep: "Type a question or an action request for this agent."
  };
  return persist(result, {
    title: "Classify request",
    input: { message },
    error: "No supported intent found."
  });
}
