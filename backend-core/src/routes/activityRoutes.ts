import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { serializeActivityLog } from "../services/serializerService.js";

export const activityRoutes = Router();

activityRoutes.get("/", async (req, res) => {
  const logs = await prisma.activityLog.findMany({
    where: { userId: req.userId },
    include: { agent: true },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  res.json({ logs: logs.map(serializeActivityLog) });
});
