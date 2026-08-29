import { Router } from "express";
import { getOperationalSummary } from "../services/operationalSummaryService.js";
import { requireModerateMarketplaceCapability } from "../services/userCapabilityService.js";

export const operationsRoutes = Router();
operationsRoutes.get("/summary", async (req, res) => {
  await requireModerateMarketplaceCapability(req.userId);
  res.json({ operations: await getOperationalSummary() });
});
