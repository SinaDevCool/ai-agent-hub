import { Router } from "express";
import { z } from "zod";
import { getOrCreateAgentConversation, runAgentForUser } from "../services/agentRuntimeService.js";

export const agentRuntimeRoutes = Router();

const runAgentSchema = z.object({
  message: z.string().trim().min(1).max(1200)
});

agentRuntimeRoutes.get("/:agentId/conversation", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const conversation = await getOrCreateAgentConversation({
    userId: req.userId,
    agentId: req.params.agentId
  });
  if (!conversation) return res.status(404).json({ error: { message: "Agent not found" } });
  res.json({ conversation });
});

agentRuntimeRoutes.post("/:agentId/run", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const input = runAgentSchema.parse(req.body);
  const result = await runAgentForUser({
    userId: req.userId,
    agentId: req.params.agentId,
    message: input.message
  });
  res.json(result);
});
