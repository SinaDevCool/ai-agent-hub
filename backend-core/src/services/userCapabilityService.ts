import type { UserRole } from "@prisma/client";
import { moderatorUserIds } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";

function capabilitiesFor(input: { id: string; role: UserRole }) {
  const canModerateMarketplace = input.role === "moderator" || input.role === "admin" || moderatorUserIds.includes(input.id);
  const canCreateMarketplaceAgents = input.role === "creator" || input.role === "moderator" || input.role === "admin";
  return { canCreateMarketplaceAgents, canModerateMarketplace };
}

export async function getCurrentUserCapabilities(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true }
  });
  if (!user) return null;
  return {
    user,
    capabilities: capabilitiesFor(user)
  };
}

export async function canModerateMarketplace(userId: string) {
  const currentUser = await getCurrentUserCapabilities(userId);
  return Boolean(currentUser?.capabilities.canModerateMarketplace);
}

export async function requireCreateMarketplaceCapability(userId: string | undefined, code = "creator_capability_required") {
  if (!userId) throw httpError(400, "No user context available", "missing_user_context");
  const currentUser = await getCurrentUserCapabilities(userId);
  if (!currentUser?.capabilities.canCreateMarketplaceAgents) {
    throw httpError(403, "Creator tools are not enabled for this account.", code);
  }
  return currentUser;
}

export async function requireModerateMarketplaceCapability(userId: string | undefined) {
  if (!userId) throw httpError(400, "No user context available", "missing_user_context");
  const currentUser = await getCurrentUserCapabilities(userId);
  if (!currentUser?.capabilities.canModerateMarketplace) {
    throw httpError(403, "Moderator access is required.", "moderator_access_required");
  }
  return currentUser;
}
