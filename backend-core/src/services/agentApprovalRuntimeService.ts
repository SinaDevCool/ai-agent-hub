import { writeActivityLog } from "./activityLogService.js";
import type { RuntimeAgent, RuntimeBranchResult, RuntimeResult } from "./agentRuntimeTypes.js";
import { consumeApprovedHitlRequest, isContinueApprovedActionMessage, resumeApprovedToolRequest } from "./runtimeApprovalService.js";
import { friendlyActionName } from "./runtimeIntentService.js";
import { getProviderReceiptForToolRun } from "./providerReceiptService.js";
import type { NormalizedWorkflowResult } from "./workflowResultNormalizer.js";
import { finishLifeTransactionForApproval } from "./lifeTransactionService.js";

export { isContinueApprovedActionMessage };

export async function runApprovalContinuation(input: {
  userId: string;
  agent: RuntimeAgent;
  agentRunId: string;
  message: string;
}): Promise<RuntimeBranchResult> {
  const continuation = await consumeApprovedHitlRequest({
    userId: input.userId,
    agentId: input.agent.id,
    missingReply: `${input.agent.name} could not find an approved action to continue.`,
    missingReason: "No unused, unexpired approval request was found for this agent.",
    usedReply: `${input.agent.name} could not continue that approval because it was already used or expired.`
  });
  if (continuation.status === "blocked") {
    return {
      result: continuation.result,
      step: {
        title: "Continue approved action",
        input: { message: input.message },
        error: continuation.result.reason
      }
    };
  }
  const approvedRequest = continuation.request;
  const resumed = await resumeApprovedToolRequest({ request: approvedRequest, agentRunId: input.agentRunId });
  if (resumed.status === "blocked") {
    const result: RuntimeResult = {
      status: "blocked",
      intent: "action",
      reply: `${input.agent.name} could not continue that approved action safely.`,
      reason: resumed.reason,
      actionName: approvedRequest.actionName,
      requestId: approvedRequest.id,
      runtimeState: "blocked",
      nextStep: "Create a fresh approval request if you still want this action."
    };
    return {
      result,
      step: {
        title: "Continue approved action",
        input: { message: input.message, requestId: approvedRequest.id },
        error: resumed.reason
      }
    };
  }

  if (resumed.result.status === "awaiting_human_approval") {
    const providerReceipt = await getProviderReceiptForToolRun({
      userId: input.userId,
      toolRunId: resumed.result.toolRunId
    });
    const result: RuntimeResult = {
      status: "awaiting_human_approval",
      intent: "action",
      reply: providerReceipt?.display.summary ?? `${input.agent.name} still needs approval before this action can continue.`,
      actionName: approvedRequest.actionName,
      requestId: resumed.result.requestId,
      runtimeState: "needs_approval",
      nextStep: "Approve or deny the new request before continuing.",
      provider: "workflow",
      providerReceipt
    };
    return {
      result,
      step: {
        title: "Continue approved action",
        toolRunId: resumed.result.toolRunId,
        input: { message: input.message, requestId: approvedRequest.id },
        output: { requestId: resumed.result.requestId }
      }
    };
  }

  if (resumed.result.status === "blocked") {
    await finishLifeTransactionForApproval({ userId: input.userId, hitlRequestId: approvedRequest.id, succeeded: false, failureReason: resumed.result.reason });
    const providerReceipt = await getProviderReceiptForToolRun({
      userId: input.userId,
      toolRunId: resumed.result.toolRunId
    });
    const result: RuntimeResult = {
      status: "blocked",
      intent: "action",
      reply: providerReceipt?.display.summary ?? `${input.agent.name} tried the approved action, but the connected service could not finish it.`,
      reason: resumed.result.reason,
      actionName: approvedRequest.actionName,
      requestId: approvedRequest.id,
      runtimeState: "blocked",
      nextStep: resumed.result.nextAction === "connect_account"
        ? "Reconnect the required account, then create a fresh approval."
        : "Try again or check the connected service setup.",
      provider: "workflow",
      providerReceipt
    };
    return {
      result,
      step: {
        title: "Continue approved action",
        toolRunId: resumed.result.toolRunId,
        input: { message: input.message, requestId: approvedRequest.id, toolName: resumed.payload.toolName },
        error: resumed.result.reason
      }
    };
  }

  await writeActivityLog({
    userId: input.userId,
    agentId: input.agent.id,
    actionType: "execution_triggered",
    status: "success",
    dataAccessed: approvedRequest.actionName,
    dynamicMetadata: {
      source: "agent_runtime",
      eventCategory: "provider",
      userTitle: `${input.agent.name} completed ${friendlyActionName(approvedRequest.actionName)}`,
      userSummary: "This approved action was completed once and recorded.",
      statusLabel: "Done",
      approvalStatus: "allowed",
      actionName: approvedRequest.actionName,
      requestId: approvedRequest.id,
      toolRunId: resumed.result.toolRunId,
      toolName: resumed.payload.toolName,
      resumeSource: "approved_tool_resume",
      nextStep: "Review receipts for details."
    }
  });
  const workflowResult = resumed.result.result?.workflowResult as NormalizedWorkflowResult | undefined;
  await finishLifeTransactionForApproval({ userId: input.userId, hitlRequestId: approvedRequest.id, succeeded: true, result: resumed.result.result });
  const providerReceipt = await getProviderReceiptForToolRun({
    userId: input.userId,
    toolRunId: resumed.result.toolRunId
  });
  const result: RuntimeResult = {
    status: "ok",
    intent: "action",
    reply: `${input.agent.name} completed the approved action: ${friendlyActionName(approvedRequest.actionName)}.`,
    actionName: resumed.result.actionName ?? approvedRequest.actionName,
    requestId: approvedRequest.id,
    workflowResult,
    providerReceipt,
    provider: workflowResult || providerReceipt ? "workflow" : undefined,
    runtimeState: "ready",
    nextStep: "The real action result is recorded in Receipts."
  };
  return {
    result,
    step: {
      title: "Complete approved action",
      toolRunId: resumed.result.toolRunId,
      input: { message: input.message, requestId: approvedRequest.id, toolName: resumed.payload.toolName },
      output: resumed.result.result ?? { actionName: approvedRequest.actionName, requestId: approvedRequest.id }
    }
  };
}
