import { Router } from "express";
import { z } from "zod";
import { getOrCreateAgentConversation, runAgentForUser } from "../services/agentRuntimeService.js";
import { runAgentPlanSchema } from "../services/agentInterpretationSchema.js";
import { env } from "../config/env.js";

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

agentRuntimeRoutes.post("/:agentId/run-plan", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  if (env.LOCAL_AI_KILL_SWITCH === "true" || env.LOCAL_AI_ENABLED !== "true" || env.LOCAL_AI_PLAN_ENDPOINT_ENABLED !== "true") {
    return res.status(503).json({ error: { code: "LOCAL_AI_DISABLED", message: "Local AI planning is currently disabled." } });
  }
  const input = runAgentPlanSchema.parse(req.body);
  const result = await runAgentForUser({
    userId: req.userId,
    agentId: req.params.agentId,
    message: input.displayText,
    interpretation: input.interpretation,
    clientRuntime: input.clientRuntime
  });
  res.json(result);
});
