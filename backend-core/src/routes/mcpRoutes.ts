import { Router } from "express";
import { z } from "zod";
import { handleToolCall } from "../services/mcpProxyService.js";

export const mcpRoutes = Router();

const toolCallSchema = z.object({
  agentId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.unknown()).default({})
});

mcpRoutes.post("/tool-call", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const input = toolCallSchema.parse(req.body);
  const result = await handleToolCall({ userId: req.userId, ...input });
  res.json(result);
});
