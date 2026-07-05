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
      dataAccessed: input.vaultSchemaId,
      dynamicMetadata: {
        decision: "revoked",
        permissionType: input.permissionType,
        vaultSchemaId: input.vaultSchemaId
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
      decision: "granted",
      permissionType: input.permissionType,
      vaultSchemaId: input.vaultSchemaId,
      restrictionRules: input.restrictionRules
    }
  });
  res.json({ permission });
});
