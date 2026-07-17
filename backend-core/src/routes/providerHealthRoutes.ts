import { Router } from "express";
import { z } from "zod";
import { getProviderHealthForUser, getProviderReadinessSummary } from "../services/providerHealthService.js";

export const providerHealthRoutes = Router();

const providerHealthQuerySchema = z.object({
  agentId: z.string().min(1).optional(),
  capabilityKey: z.string().min(1).optional(),
  providerId: z.string().min(1).optional()
});

providerHealthRoutes.get("/", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const query = providerHealthQuerySchema.parse(req.query);
  const health = await getProviderHealthForUser({
    userId: req.userId,
    agentId: query.agentId,
    capabilityKey: query.capabilityKey,
    providerId: query.providerId
  });
  res.json({ health });
});

providerHealthRoutes.get("/summary", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const query = providerHealthQuerySchema.parse(req.query);
  const summary = await getProviderReadinessSummary({
    userId: req.userId,
    agentId: query.agentId,
    capabilityKey: query.capabilityKey,
    providerId: query.providerId
  });
  res.json({ summary });
});
