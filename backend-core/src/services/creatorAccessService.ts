import type { CreatorAccessRequest } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";
import { getCurrentUserCapabilities, requireModerateMarketplaceCapability } from "./userCapabilityService.js";

function cleanReason(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function serializeRequest(request: CreatorAccessRequest & { user?: { email: string } | null; reviewedBy?: { email: string } | null }) {
  return {
    id: request.id,
    userId: request.userId,
    userEmail: request.user?.email,
    status: request.status,
    reason: request.reason,
    reviewNote: request.reviewNote,
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    reviewedByUserId: request.reviewedByUserId,
    reviewedByEmail: request.reviewedBy?.email,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString()
  };
}

export async function getMyCreatorAccess(userId: string) {
  const currentUser = await getCurrentUserCapabilities(userId);
  if (!currentUser) throw httpError(404, "User not found.", "user_not_found");
  const request = await prisma.creatorAccessRequest.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true } }, reviewedBy: { select: { email: true } } }
  });
  return {
    canCreateMarketplaceAgents: currentUser.capabilities.canCreateMarketplaceAgents,
    request: request ? serializeRequest(request) : null
  };
}

export async function requestCreatorAccess(userId: string, body: unknown) {
  const currentUser = await getCurrentUserCapabilities(userId);
  if (!currentUser) throw httpError(404, "User not found.", "user_not_found");
  if (currentUser.capabilities.canCreateMarketplaceAgents) {
    throw httpError(409, "Creator tools are already enabled for this account.", "creator_access_already_enabled");
  }
  const existingPending = await prisma.creatorAccessRequest.findFirst({
    where: { userId, status: "pending" }
  });
  if (existingPending) {
    throw httpError(409, "Your creator access request is already pending.", "creator_access_request_pending");
  }
  const reason = cleanReason((body as { reason?: unknown } | null)?.reason);
  if (reason.length < 12) {
    throw httpError(400, "Tell us what you want to publish.", "creator_access_reason_required");
  }
  const request = await prisma.creatorAccessRequest.create({
    data: { userId, reason: reason.slice(0, 800) },
    include: { user: { select: { email: true } }, reviewedBy: { select: { email: true } } }
  });
  return serializeRequest(request);
}

export async function listCreatorAccessRequests(reviewerUserId: string) {
  await requireModerateMarketplaceCapability(reviewerUserId);
  const requests = await prisma.creatorAccessRequest.findMany({
    include: { user: { select: { email: true } }, reviewedBy: { select: { email: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }]
  });
  return requests.map(serializeRequest);
}

export async function approveCreatorAccessRequest(reviewerUserId: string, requestId: string) {
  await requireModerateMarketplaceCapability(reviewerUserId);
  const existing = await prisma.creatorAccessRequest.findUnique({ where: { id: requestId } });
  if (!existing) throw httpError(404, "Creator access request not found.", "creator_access_request_not_found");
  if (existing.status !== "pending") {
    throw httpError(409, "Only pending creator access requests can be approved.", "creator_access_review_required");
  }
  const request = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: existing.userId }, data: { role: "creator" } });
    return tx.creatorAccessRequest.update({
      where: { id: requestId },
      data: {
        status: "approved",
        reviewedAt: new Date(),
        reviewedByUserId: reviewerUserId,
        reviewNote: ""
      },
      include: { user: { select: { email: true } }, reviewedBy: { select: { email: true } } }
    });
  });
  return serializeRequest(request);
}

export async function denyCreatorAccessRequest(reviewerUserId: string, requestId: string, body: unknown) {
  await requireModerateMarketplaceCapability(reviewerUserId);
  const existing = await prisma.creatorAccessRequest.findUnique({ where: { id: requestId } });
  if (!existing) throw httpError(404, "Creator access request not found.", "creator_access_request_not_found");
  if (existing.status !== "pending") {
    throw httpError(409, "Only pending creator access requests can be denied.", "creator_access_review_required");
  }
  const note = cleanReason((body as { note?: unknown } | null)?.note);
  const request = await prisma.creatorAccessRequest.update({
    where: { id: requestId },
    data: {
      status: "denied",
      reviewedAt: new Date(),
      reviewedByUserId: reviewerUserId,
      reviewNote: note.slice(0, 500)
    },
    include: { user: { select: { email: true } }, reviewedBy: { select: { email: true } } }
  });
  return serializeRequest(request);
}
