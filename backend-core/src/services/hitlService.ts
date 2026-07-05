import { prisma } from "../db/prisma.js";
import { realtimeHub } from "./realtimeHub.js";
import { writeActivityLog } from "./activityLogService.js";
import { encodeJson } from "./jsonService.js";

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
    include: { agent: true }
  });
  await writeActivityLog({
    userId: input.userId,
    agentId: input.agentId,
    actionType: "hitl_requested",
    status: "pending_human_approval",
    dataAccessed: input.actionName,
    dynamicMetadata: { requestId: request.id }
  });
  realtimeHub.broadcast({ type: "hitl.requested", payload: request });
  return request;
}

export async function decideHitlRequest(id: string, userId: string, approved: boolean) {
  await prisma.hitlRequest.updateMany({
    where: { id, userId },
    data: {
      status: approved ? "success" : "blocked_by_policy",
      decidedAt: new Date()
    }
  });
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
