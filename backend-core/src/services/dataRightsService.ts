import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";
import { enqueueDurableJob } from "./durableJobService.js";

function assertEnabled() {
  if (env.PRIVACY_RIGHTS_ENABLED !== "true") {
    throw httpError(503, "Data-rights requests are not enabled in this environment.", "feature_disabled");
  }
}

export async function listDataRightsRequests(userId: string) {
  assertEnabled();
  return prisma.dataRightsRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, requestType: true, status: true, executeAfter: true, completedAt: true, cancelledAt: true, createdAt: true, updatedAt: true }
  });
}

export async function createDataRightsRequest(input: {
  userId: string;
  requestType: "export" | "deletion";
  confirmation?: string;
  now?: Date;
}) {
  assertEnabled();
  if (input.requestType === "deletion" && input.confirmation !== "DELETE MY ACCOUNT") {
    throw httpError(400, "Deletion requires the exact confirmation: DELETE MY ACCOUNT", "confirmation_required");
  }
  const now = input.now ?? new Date();
  const executeAfter = input.requestType === "deletion"
    ? new Date(now.getTime() + env.PRIVACY_DELETION_GRACE_HOURS * 3_600_000)
    : now;
  const active = await prisma.dataRightsRequest.findFirst({
    where: { userId: input.userId, requestType: input.requestType, status: { in: ["pending", "scheduled", "processing"] } }
  });
  if (active) return { request: active, deduplicated: true };
  let request;
  try {
    request = await prisma.dataRightsRequest.create({ data: {
      userId: input.userId,
      requestType: input.requestType,
      status: "scheduled",
      executeAfter
    } });
  } catch (error) {
    const raced = await prisma.dataRightsRequest.findFirst({
      where: { userId: input.userId, requestType: input.requestType, status: { in: ["pending", "scheduled", "processing"] } }
    });
    if (raced) return { request: raced, deduplicated: true };
    throw error;
  }
  await enqueueDurableJob({
    jobType: input.requestType === "export" ? "privacy_export" : "privacy_deletion",
    dedupeKey: `data-rights:${request.id}`,
    payload: { requestId: request.id },
    userId: input.userId,
    aggregateType: "data_rights_request",
    aggregateId: request.id,
    correlationId: request.id,
    scheduledAt: executeAfter,
    maxAttempts: 5
  });
  return { request, deduplicated: false };
}

export async function cancelDeletionRequest(input: { userId: string; requestId: string; now?: Date }) {
  assertEnabled();
  const now = input.now ?? new Date();
  const request = await prisma.dataRightsRequest.findFirst({ where: { id: input.requestId, userId: input.userId, requestType: "deletion" } });
  if (!request) throw httpError(404, "Deletion request not found.", "not_found");
  if (!(["pending", "scheduled"] as string[]).includes(request.status) || request.executeAfter <= now) {
    throw httpError(409, "This deletion request can no longer be cancelled.", "cancellation_window_closed");
  }
  const updated = await prisma.dataRightsRequest.updateMany({
    where: { id: request.id, userId: input.userId, status: { in: ["pending", "scheduled"] }, executeAfter: { gt: now } },
    data: { status: "cancelled", cancelledAt: now }
  });
  if (updated.count !== 1) throw httpError(409, "This deletion request can no longer be cancelled.", "cancellation_window_closed");
  await prisma.durableJob.updateMany({
    where: { aggregateType: "data_rights_request", aggregateId: request.id, status: { in: ["queued", "retry_scheduled"] } },
    data: { status: "cancelled", completedAt: now }
  });
  return prisma.dataRightsRequest.findUniqueOrThrow({ where: { id: request.id } });
}
