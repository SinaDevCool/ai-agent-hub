import type { ActivityActionType, ActivityStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { createAuditHash } from "./cryptoService.js";
import { realtimeHub } from "./realtimeHub.js";
import { decodeJson, encodeJson } from "./jsonService.js";

export async function writeActivityLog(input: {
  userId: string;
  agentId?: string | null;
  actionType: ActivityActionType;
  status: ActivityStatus;
  dataAccessed?: string | null;
  dynamicMetadata: Record<string, unknown>;
}) {
  const previous = await prisma.activityLog.findFirst({
    where: { userId: input.userId },
    orderBy: { createdAt: "desc" },
    select: { hash: true }
  });
  const hash = createAuditHash(input, previous?.hash);
  const log = await prisma.activityLog.create({
    data: {
      ...input,
      dynamicMetadata: encodeJson(input.dynamicMetadata),
      previousHash: previous?.hash ?? null,
      hash
    },
    include: { agent: true }
  });
  realtimeHub.broadcast({ type: "activity.created", payload: { ...log, dynamicMetadata: decodeJson(log.dynamicMetadata, {}) } });
  return log;
}
