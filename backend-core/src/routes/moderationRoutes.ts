import { Router } from "express";
import {
  approveModerationAgent,
  listModerationAgents,
  sendBackModerationAgent
} from "../services/moderationService.js";
import { requireModerateMarketplaceCapability } from "../services/userCapabilityService.js";

export const moderationRoutes = Router();

moderationRoutes.get("/creator-agents", async (req, res) => {
  await requireModerateMarketplaceCapability(req.userId);
  const userId = req.userId!;
  res.json({ agents: await listModerationAgents(userId) });
});

moderationRoutes.post("/creator-agents/:id/approve", async (req, res) => {
  await requireModerateMarketplaceCapability(req.userId);
  const userId = req.userId!;
  res.json({ agent: await approveModerationAgent(userId, req.params.id) });
});

moderationRoutes.post("/creator-agents/:id/send-back", async (req, res) => {
  await requireModerateMarketplaceCapability(req.userId);
  const userId = req.userId!;
  res.json({ agent: await sendBackModerationAgent(userId, req.params.id, req.body) });
});
