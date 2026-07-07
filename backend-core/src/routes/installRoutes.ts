import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { serializeUserAgentInstall } from "../services/serializerService.js";

export const installRoutes = Router();

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
