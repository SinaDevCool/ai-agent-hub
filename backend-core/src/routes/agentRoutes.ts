import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { serializeAgent } from "../services/serializerService.js";

export const agentRoutes = Router();

agentRoutes.get("/", async (_req, res) => {
  const agents = await prisma.agent.findMany({
    include: { permissions: { include: { vaultSchema: true } }, connections: true },
    orderBy: { name: "asc" }
  });
  res.json({ agents: agents.map(serializeAgent) });
});

agentRoutes.get("/:id", async (req, res) => {
  const agent = await prisma.agent.findUnique({
    where: { id: req.params.id },
    include: { permissions: { include: { vaultSchema: true } }, connections: true }
  });
  if (!agent) return res.status(404).json({ error: { message: "Agent not found" } });
  res.json({ agent: serializeAgent(agent) });
});
