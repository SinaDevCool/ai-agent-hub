import { Router } from "express";
import { z } from "zod";
import { searchLiveHouseholdProviders } from "../services/googlePlacesHouseholdProvider.js";
import { continueHostedHouseholdHandoff, prepareHostedHouseholdHandoff } from "../services/hostedHouseholdHandoffService.js";
export const householdLiveRoutes = Router();
householdLiveRoutes.post("/search", async (req, res) => { const body = z.object({ serviceType: z.string().trim().min(1).max(100), location: z.string().trim().min(1).max(160) }).parse(req.body); res.json(await searchLiveHouseholdProviders(body)); });
householdLiveRoutes.post("/handoff/prepare", async (req, res) => { const body = z.object({ agentId: z.string().min(1), placeId: z.string().trim().min(10).max(300), serviceType: z.string().trim().min(1).max(100), location: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(500), idempotencyKey: z.string().trim().min(8).max(200) }).parse(req.body); res.status(201).json(await prepareHostedHouseholdHandoff({ userId: req.userId!, ...body })); });
householdLiveRoutes.post("/handoff/:id/continue", async (req, res) => { res.json(await continueHostedHouseholdHandoff({ userId: req.userId!, transactionId: req.params.id })); });
