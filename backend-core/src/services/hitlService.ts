import { prisma } from "../db/prisma.js";
import { realtimeHub } from "./realtimeHub.js";
import { writeActivityLog } from "./activityLogService.js";
import { encodeJson } from "./jsonService.js";
import { sendApprovalNotification } from "./notificationService.js";

function invalidApprovalError(message: string) {
  return Object.assign(new Error(message), { statusCode: 409, code: "invalid_approval_state" });
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
      requestId: request.id,
      notificationId: notification.notificationId,
      notificationStatus: notification.status,
      notificationProvider: notification.provider,
      notificationReason: notification.reason
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
    where: { id, userId }
  });
  await writeActivityLog({
    userId: request.userId,
    agentId: request.agentId,
    actionType: approved ? "hitl_approved" : "hitl_denied",
    status: approved ? "success" : "blocked_by_policy",
    dataAccessed: request.actionName,
    dynamicMetadata: { requestId: id }
  });
  return request;
}
