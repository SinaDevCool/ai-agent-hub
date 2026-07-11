import { Router } from "express";
import { importExternalAgentForUser, previewExternalAgentImport } from "../services/externalAgentImportService.js";
import { requireCreateMarketplaceCapability } from "../services/userCapabilityService.js";

export const externalAgentImportRoutes = Router();

externalAgentImportRoutes.post("/preview", async (req, res) => {
  await requireCreateMarketplaceCapability(req.userId, "external_import_capability_required");
  res.json({ preview: await previewExternalAgentImport(req.body) });
});

externalAgentImportRoutes.post("/import", async (req, res) => {
  await requireCreateMarketplaceCapability(req.userId, "external_import_capability_required");
  const userId = req.userId!;
  const result = await importExternalAgentForUser({ userId, body: req.body });
  res.status(result.created ? 201 : 200).json({ install: result.install, preview: result.preview });
});
