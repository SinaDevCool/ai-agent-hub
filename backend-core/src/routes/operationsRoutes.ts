import { Router } from "express";
import { getOperationalSummary } from "../services/operationalSummaryService.js";
import { requireModerateMarketplaceCapability } from "../services/userCapabilityService.js";
import { getProviderActivationReadiness } from "../services/providerActivationReadinessService.js";
import { getLocalAiReadiness } from "../services/localAiReadinessService.js";

export const operationsRoutes = Router();
operationsRoutes.get("/summary", async (req, res) => {
  await requireModerateMarketplaceCapability(req.userId);
  res.json({ operations: await getOperationalSummary() });
});
operationsRoutes.get("/local-ai-readiness", async (req, res) => {
  await requireModerateMarketplaceCapability(req.userId);
  res.json({ readiness: await getLocalAiReadiness() });
});
operationsRoutes.get("/activation-readiness/:providerId", async (req, res) => {
  await requireModerateMarketplaceCapability(req.userId);
  res.json({ activation: await getProviderActivationReadiness(req.params.providerId) });
});
