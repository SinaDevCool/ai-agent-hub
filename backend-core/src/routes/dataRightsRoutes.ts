import { Router } from "express";
import { z } from "zod";
import { cancelDeletionRequest, createDataRightsRequest, listDataRightsRequests } from "../services/dataRightsService.js";

export const dataRightsRoutes = Router();

dataRightsRoutes.get("/", async (req, res) => {
  res.json({ requests: await listDataRightsRequests(req.userId!) });
});

dataRightsRoutes.post("/", async (req, res) => {
  const body = z.object({ requestType: z.enum(["export", "deletion"]), confirmation: z.string().max(100).optional() }).parse(req.body);
  const result = await createDataRightsRequest({ userId: req.userId!, ...body });
  res.status(result.deduplicated ? 200 : 202).json(result);
});

dataRightsRoutes.post("/:id/cancel", async (req, res) => {
  res.json({ request: await cancelDeletionRequest({ userId: req.userId!, requestId: req.params.id }) });
});
