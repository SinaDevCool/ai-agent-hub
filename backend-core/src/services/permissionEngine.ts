import type { PermissionType } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { GatekeeperDecision } from "../types/api.js";
import { writeActivityLog } from "./activityLogService.js";
import { decodeJson } from "./jsonService.js";

const highRiskActions = new Set([
  "open_credit_card",
  "transfer_funds",
  "book_non_refundable_travel",
  "sign_contract",
  "share_medical_record"
]);

export async function evaluateVaultPermission(input: {
  userId: string;
  agentId: string;
  permissionType: PermissionType;
  vaultSchemaId?: string | null;
  relativePath?: string;
}): Promise<GatekeeperDecision> {
  const connection = await prisma.userConnection.findUnique({
    where: { userId_agentId: { userId: input.userId, agentId: input.agentId } }
  });
  if (!connection || connection.connectionStatus === "revoked") {
    return { allowed: false, reason: "Agent is not actively connected to this user.", status: "blocked_by_policy" };
  }
  if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
    return { allowed: false, reason: "Agent connection token has expired.", status: "blocked_by_policy" };
  }
  const permission = await prisma.agentPermission.findFirst({
    where: {
      agentId: input.agentId,
      permissionType: input.permissionType,
      OR: [{ vaultSchemaId: input.vaultSchemaId ?? undefined }, { vaultSchemaId: null }]
    }
  });
  if (!permission) {
    return { allowed: false, reason: "No matching access clearance ticket permission exists.", status: "blocked_by_policy" };
  }
  if (permission.expiresAt && permission.expiresAt < new Date()) {
    return { allowed: false, reason: "Access clearance ticket has expired.", status: "blocked_by_policy" };
  }
  const rules = decodeJson<Record<string, unknown>>(permission.restrictionRules, {});
  const deniedPaths = Array.isArray(rules.deniedPaths) ? rules.deniedPaths.map(String) : [];
  if (input.relativePath && deniedPaths.some((prefix) => input.relativePath?.startsWith(prefix))) {
    return { allowed: false, reason: "Restriction rules deny this vault path.", status: "blocked_by_policy" };
  }
  return { allowed: true, reason: "Permission, connection, expiry, and restriction rules passed." };
}

export function isHighRiskAction(actionName: string) {
  return highRiskActions.has(actionName);
}

export async function logDecision(input: {
  userId: string;
  agentId: string;
  actionType: "vault_read" | "vault_write" | "execution_triggered";
  decision: GatekeeperDecision;
  dataAccessed?: string;
  metadata?: Record<string, unknown>;
}) {
  return writeActivityLog({
    userId: input.userId,
    agentId: input.agentId,
    actionType: input.actionType,
    status: input.decision.allowed ? "success" : input.decision.status,
    dataAccessed: input.dataAccessed,
    dynamicMetadata: { reason: input.decision.reason, ...input.metadata }
  });
}
