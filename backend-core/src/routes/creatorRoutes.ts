import { Router } from "express";
import {
  archiveCreatorAgent,
  createCreatorAgentDraft,
  getCreatorAgentReadiness,
  listCreatorAgents,
  publishCreatorAgent,
  updateCreatorAgentDraft
} from "../services/creatorService.js";
import { getCreatorProfile, upsertCreatorProfile } from "../services/creatorProfileService.js";
import { requireCreateMarketplaceCapability } from "../services/userCapabilityService.js";

export const creatorRoutes = Router();

creatorRoutes.get("/profile", async (req, res) => {
  await requireCreateMarketplaceCapability(req.userId);
  const userId = req.userId!;
  res.json({ profile: await getCreatorProfile(userId) });
});

creatorRoutes.put("/profile", async (req, res) => {
  await requireCreateMarketplaceCapability(req.userId);
  const userId = req.userId!;
  res.json({ profile: await upsertCreatorProfile(userId, req.body) });
});

creatorRoutes.get("/agents", async (req, res) => {
  await requireCreateMarketplaceCapability(req.userId);
  const userId = req.userId!;
  res.json({ agents: await listCreatorAgents(userId) });
});

creatorRoutes.post("/agents", async (req, res) => {
  await requireCreateMarketplaceCapability(req.userId);
  const userId = req.userId!;
  res.status(201).json({ agent: await createCreatorAgentDraft(userId, req.body) });
});

creatorRoutes.put("/agents/:id", async (req, res) => {
  await requireCreateMarketplaceCapability(req.userId);
  const userId = req.userId!;
  res.json({ agent: await updateCreatorAgentDraft(userId, req.params.id, req.body) });
});

creatorRoutes.get("/agents/:id/readiness", async (req, res) => {
  await requireCreateMarketplaceCapability(req.userId);
  const userId = req.userId!;
  res.json({ readiness: await getCreatorAgentReadiness(userId, req.params.id) });
});

creatorRoutes.post("/agents/:id/publish", async (req, res) => {
  await requireCreateMarketplaceCapability(req.userId);
  const userId = req.userId!;
  res.json(await publishCreatorAgent(userId, req.params.id));
});

creatorRoutes.post("/agents/:id/archive", async (req, res) => {
  await requireCreateMarketplaceCapability(req.userId);
  const userId = req.userId!;
  res.json({ agent: await archiveCreatorAgent(userId, req.params.id) });
});
