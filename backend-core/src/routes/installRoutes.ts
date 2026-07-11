import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { getCurrentUserCapabilities } from "../services/userCapabilityService.js";
import { serializeUserAgentInstall } from "../services/serializerService.js";

export const installRoutes = Router();

installRoutes.get("/", async (req, res) => {
  if (!req.userId) return res.status(400).json({ error: { message: "No user context available" } });
  const currentUser = await getCurrentUserCapabilities(req.userId);
  if (!currentUser) return res.status(404).json({ error: { message: "User not found", code: "user_not_found" } });
  res.json(currentUser);
});

installRoutes.get("/agents", async (req, res) => {
  const installs = await prisma.userAgentInstall.findMany({
    where: { userId: req.userId },
    include: {
      agentDefinition: {
        include: {
          creator: true,
          versions: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" } }
        }
      },
      agentVersion: true,
      agent: {
        include: {
          permissions: { where: { userId: req.userId }, include: { vaultSchema: true } },
          connections: { where: { userId: req.userId } }
        }
      }
    },
    orderBy: { installedAt: "desc" }
  });
  res.json({ installs: installs.map(serializeUserAgentInstall) });
});
