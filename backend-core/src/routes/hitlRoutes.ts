import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { decideHitlRequest } from "../services/hitlService.js";
import { serializeHitlRequest } from "../services/serializerService.js";

export const hitlRoutes = Router();

hitlRoutes.get("/", async (req, res) => {
  const requests = await prisma.hitlRequest.findMany({
    where: { userId: req.userId, status: "pending_human_approval" },
    include: { agent: true },
    orderBy: { createdAt: "desc" }
  });
  res.json({ requests: requests.map(serializeHitlRequest) });
});

hitlRoutes.post("/:id/decision", async (req, res) => {
  const input = z.object({ approved: z.boolean() }).parse(req.body);
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const request = await decideHitlRequest(req.params.id, req.userId, input.approved);
  res.json({ request: serializeHitlRequest(request) });
});
