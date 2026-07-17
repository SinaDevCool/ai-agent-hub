import { Router } from "express";
import {
  createProviderDefinition,
  listProviderDefinitions,
  setProviderDefinitionStatus,
  updateProviderDefinition
} from "../services/providerDefinitionService.js";
import { checkProviderDefinitionHealth } from "../services/providerHealthService.js";
import { requireModerateMarketplaceCapability } from "../services/userCapabilityService.js";

export const providerDefinitionRoutes = Router();

providerDefinitionRoutes.use(async (req, _res, next) => {
  try {
    await requireModerateMarketplaceCapability(req.userId);
    next();
  } catch (error) {
    next(error);
  }
});

providerDefinitionRoutes.get("/", async (_req, res) => {
  res.json({ providers: await listProviderDefinitions() });
});

providerDefinitionRoutes.post("/", async (req, res) => {
  res.status(201).json({ provider: await createProviderDefinition(req.userId!, req.body) });
});

providerDefinitionRoutes.patch("/:id", async (req, res) => {
  res.json({ provider: await updateProviderDefinition(req.params.id, req.body) });
});

providerDefinitionRoutes.get("/:providerId/health", async (req, res) => {
  res.json({ health: await checkProviderDefinitionHealth({ providerId: req.params.providerId }) });
});

providerDefinitionRoutes.post("/:providerId/health/check", async (req, res) => {
  res.json({ health: await checkProviderDefinitionHealth({ providerId: req.params.providerId }) });
});

providerDefinitionRoutes.post("/:id/disable", async (req, res) => {
  res.json({ provider: await setProviderDefinitionStatus(req.params.id, "disabled") });
});

providerDefinitionRoutes.post("/:id/enable", async (req, res) => {
  res.json({ provider: await setProviderDefinitionStatus(req.params.id, "active") });
});
