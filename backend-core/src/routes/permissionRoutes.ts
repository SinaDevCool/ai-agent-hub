import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { encodeJson } from "../services/jsonService.js";
import { writeActivityLog } from "../services/activityLogService.js";

export const permissionRoutes = Router();

const updateSchema = z.object({
  agentId: z.string(),
  vaultSchemaId: z.string().nullable(),
  permissionType: z.enum(["read", "write", "execute_action"]),
  enabled: z.boolean(),
  restrictionRules: z.record(z.unknown()).default({}),
  expiresAt: z.string().datetime().optional()
});

permissionRoutes.post("/clearance", async (req, res) => {
  if (!req.userId) return res.status(400).json({ error: { message: "No user context available" } });
  const userId = req.userId;
  const input = updateSchema.parse(req.body);
  const connection = await prisma.userConnection.findUnique({
    where: { userId_agentId: { userId, agentId: input.agentId } },
    select: { id: true }
  });
  if (!connection) return res.status(404).json({ error: { message: "Agent not connected to this user" } });

  if (!input.enabled) {
    const schema = input.vaultSchemaId
      ? await prisma.vaultSchema.findUnique({ where: { id: input.vaultSchemaId }, select: { name: true } })
      : null;
    await prisma.agentPermission.deleteMany({
      where: {
        userId,
        agentId: input.agentId,
        vaultSchemaId: input.vaultSchemaId,
        permissionType: input.permissionType
      }
    });
    await writeActivityLog({
      userId,
      agentId: input.agentId,
      actionType: "permission_requested",
      status: "blocked_by_policy",
      dataAccessed: schema?.name ?? input.permissionType,
      dynamicMetadata: {
        source: "agent_runtime",
        eventCategory: "private_info",
        userTitle: "Private info access removed",
        userSummary: "This agent can no longer use this private info.",
        statusLabel: "Removed",
        privateInfoUsed: schema?.name ? [schema.name] : [],
        decision: "revoked",
        permissionType: input.permissionType,
        vaultSchemaId: input.vaultSchemaId,
        nextStep: "Allow access again if you want this agent to use it later."
      }
    });
    return res.json({ permission: null });
  }
  const existing = await prisma.agentPermission.findFirst({
    where: {
      agentId: input.agentId,
      userId,
      vaultSchemaId: input.vaultSchemaId,
      permissionType: input.permissionType
    }
  });
  const data = {
    agentId: input.agentId,
    userId,
    vaultSchemaId: input.vaultSchemaId,
    permissionType: input.permissionType,
    restrictionRules: encodeJson(input.restrictionRules),
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
  };
  const permission = existing
    ? await prisma.agentPermission.update({ where: { id: existing.id }, data })
    : await prisma.agentPermission.create({ data });
  const schema = input.vaultSchemaId
    ? await prisma.vaultSchema.findUnique({ where: { id: input.vaultSchemaId }, select: { name: true } })
    : null;
  await writeActivityLog({
    userId,
    agentId: input.agentId,
    actionType: "permission_requested",
    status: "success",
    dataAccessed: schema?.name ?? input.permissionType,
    dynamicMetadata: {
      source: "agent_runtime",
      eventCategory: "private_info",
      userTitle: "Private info access allowed",
      userSummary: "This agent can now use this private info when needed.",
      statusLabel: "Allowed",
      privateInfoUsed: schema?.name ? [schema.name] : [],
      decision: "granted",
      permissionType: input.permissionType,
      vaultSchemaId: input.vaultSchemaId,
      restrictionRules: input.restrictionRules,
      nextStep: "Ask the agent again."
    }
  });
  res.json({ permission });
});
