import { Router } from "express";
import { z } from "zod";
import { getPublicMarketplaceAgentBySlug, listPublicMarketplaceAgents } from "../services/marketplaceService.js";

export const publicMarketplaceRoutes = Router();
const categorySchema = z.enum(["Financial", "Executive", "Wellness", "Domestic", "Legal", "Travel", "Maintenance", "Custom"]);

publicMarketplaceRoutes.get("/agents", async (req, res) => {
  const categoryInput = typeof req.query.category === "string" ? req.query.category : undefined;
  const category = categoryInput ? categorySchema.parse(categoryInput) : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  res.json({ agents: await listPublicMarketplaceAgents({ category, search }) });
});

publicMarketplaceRoutes.get("/agents/:slug", async (req, res) => {
  const agent = await getPublicMarketplaceAgentBySlug(req.params.slug);
  if (!agent) return res.status(404).json({ error: { message: "Marketplace agent not found" } });
  res.json({ agent });
});
