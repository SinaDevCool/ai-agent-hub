import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { encodeJson } from "../services/jsonService.js";

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
  const input = updateSchema.parse(req.body);
  if (!input.enabled) {
    await prisma.agentPermission.deleteMany({
      where: {
        agentId: input.agentId,
        vaultSchemaId: input.vaultSchemaId,
        permissionType: input.permissionType
      }
    });
    return res.json({ permission: null });
  }
  const existing = await prisma.agentPermission.findFirst({
    where: {
      agentId: input.agentId,
      vaultSchemaId: input.vaultSchemaId,
      permissionType: input.permissionType
    }
  });
  const data = {
    agentId: input.agentId,
    vaultSchemaId: input.vaultSchemaId,
    permissionType: input.permissionType,
    restrictionRules: encodeJson(input.restrictionRules),
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
  };
  const permission = existing
    ? await prisma.agentPermission.update({ where: { id: existing.id }, data })
    : await prisma.agentPermission.create({ data });
  res.json({ permission });
});
