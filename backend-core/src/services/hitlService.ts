import { prisma } from "../db/prisma.js";
import { realtimeHub } from "./realtimeHub.js";
import { writeActivityLog } from "./activityLogService.js";
import { encodeJson } from "./jsonService.js";
import { sendApprovalNotification } from "./notificationService.js";
import { httpError } from "../errors/httpError.js";
import { friendlyActionName } from "./runtimeIntentService.js";

function invalidApprovalError(message: string) {
  return httpError(409, message, "invalid_approval_state");
}

export async function createHitlRequest(input: {
  userId: string;
  agentId: string;
  actionName: string;
  payload: Record<string, unknown>;
  ttlMinutes?: number;
}) {
  const request = await prisma.hitlRequest.create({
    data: {
      userId: input.userId,
      agentId: input.agentId,
      actionName: input.actionName,
      riskLevel: "high",
      payload: encodeJson(input.payload),
      expiresAt: new Date(Date.now() + (input.ttlMinutes ?? 15) * 60_000)
    },
    include: { agent: true, user: true }
  });
  const notification = await sendApprovalNotification(request);
  await writeActivityLog({
    userId: input.userId,
    agentId: input.agentId,
    actionType: "hitl_requested",
    status: "pending_human_approval",
    dataAccessed: input.actionName,
    dynamicMetadata: {
      source: "agent_runtime",
      eventCategory: "approval",
      userTitle: `${request.agent.name} paused before ${friendlyActionName(input.actionName)}`,
      userSummary: "This action needs your approval before anything continues.",
      statusLabel: "Waiting for you",
      approvalStatus: "waiting",
      actionName: input.actionName,
      requestId: request.id,
      notificationId: notification.notificationId,
      notificationStatus: notification.status,
      notificationProvider: notification.provider,
      notificationReason: notification.reason,
      nextStep: "Allow once or deny."
    }
  });
  realtimeHub.broadcast({ type: "hitl.requested", payload: request });
  return request;
}

export async function decideHitlRequest(id: string, userId: string, approved: boolean) {
  const result = await prisma.hitlRequest.updateMany({
    where: {
      id,
      userId,
      status: "pending_human_approval",
      expiresAt: { gt: new Date() }
    },
    data: {
      status: approved ? "success" : "blocked_by_policy",
      decidedAt: new Date()
    }
  });
  if (result.count === 0) {
    throw invalidApprovalError("This approval request is no longer pending or has expired.");
  }
  const request = await prisma.hitlRequest.findFirstOrThrow({
    where: { id, userId },
    include: { agent: true }
  });
  await writeActivityLog({
    userId: request.userId,
    agentId: request.agentId,
    actionType: approved ? "hitl_approved" : "hitl_denied",
    status: approved ? "success" : "blocked_by_policy",
    dataAccessed: request.actionName,
    dynamicMetadata: {
      source: "agent_runtime",
      eventCategory: "approval",
      userTitle: approved ? "You allowed this once" : "You denied this action",
      userSummary: approved
        ? `${request.agent.name} may continue ${friendlyActionName(request.actionName)} one time.`
        : `${request.agent.name} will not continue ${friendlyActionName(request.actionName)}.`,
      statusLabel: approved ? "Allowed once" : "Denied",
      approvalStatus: approved ? "allowed" : "denied",
      actionName: request.actionName,
      requestId: id,
      nextStep: approved ? "Continue the approved action before it expires." : "Create a new request if you change your mind."
    }
  });
  return request;
}
