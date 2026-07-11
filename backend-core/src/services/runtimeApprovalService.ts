import type { HitlRequest } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { RuntimeResult } from "./agentRuntimeTypes.js";

export function isContinueApprovedActionMessage(message: string) {
  return /^continue the approved action:/i.test(message) || /^continue approved action:/i.test(message);
}

export type ApprovedActionContinuation =
  | { status: "ready"; request: HitlRequest }
  | { status: "blocked"; result: RuntimeResult };

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
