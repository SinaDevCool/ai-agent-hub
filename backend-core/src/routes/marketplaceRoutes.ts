import { Router } from "express";
import { z } from "zod";
import { getMarketplaceAgentBySlug, installMarketplaceAgent, listMarketplaceAgents } from "../services/marketplaceService.js";

export const marketplaceRoutes = Router();

const categorySchema = z.enum(["Financial", "Executive", "Wellness", "Domestic", "Legal", "Travel", "Maintenance", "Custom"]);

const installSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional()
});

marketplaceRoutes.get("/agents", async (req, res) => {
  const categoryInput = typeof req.query.category === "string" ? req.query.category : undefined;
  const category = categoryInput ? categorySchema.parse(categoryInput) : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  res.json({ agents: await listMarketplaceAgents({ userId: req.userId ?? "", category, search }) });
});

marketplaceRoutes.get("/agents/:slug", async (req, res) => {
  const agent = await getMarketplaceAgentBySlug({ userId: req.userId ?? "", slug: req.params.slug });
  if (!agent) return res.status(404).json({ error: { message: "Marketplace agent not found" } });
  res.json({ agent });
});

marketplaceRoutes.post("/agents/:id/install", async (req, res) => {
  if (!req.userId) return res.status(400).json({ error: { message: "No user context available" } });
  const input = installSchema.parse(req.body);
  const result = await installMarketplaceAgent({ userId: req.userId, agentDefinitionId: req.params.id, displayName: input.displayName });
  res.status(result.created ? 201 : 200).json({ install: result.install });
});
