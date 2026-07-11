import { Router } from "express";
import {
  approveCreatorAccessRequest,
  denyCreatorAccessRequest,
  getMyCreatorAccess,
  listCreatorAccessRequests,
  requestCreatorAccess
} from "../services/creatorAccessService.js";

export const creatorAccessRoutes = Router();

creatorAccessRoutes.get("/me", async (req, res) => {
  if (!req.userId) return res.status(400).json({ error: { message: "No user context available" } });
  res.json(await getMyCreatorAccess(req.userId));
});

creatorAccessRoutes.post("/request", async (req, res) => {
  if (!req.userId) return res.status(400).json({ error: { message: "No user context available" } });
  res.status(201).json({ request: await requestCreatorAccess(req.userId, req.body) });
});

creatorAccessRoutes.get("/requests", async (req, res) => {
  if (!req.userId) return res.status(400).json({ error: { message: "No user context available" } });
  res.json({ requests: await listCreatorAccessRequests(req.userId) });
});

creatorAccessRoutes.post("/requests/:id/approve", async (req, res) => {
  if (!req.userId) return res.status(400).json({ error: { message: "No user context available" } });
  res.json({ request: await approveCreatorAccessRequest(req.userId, req.params.id) });
});

creatorAccessRoutes.post("/requests/:id/deny", async (req, res) => {
  if (!req.userId) return res.status(400).json({ error: { message: "No user context available" } });
  res.json({ request: await denyCreatorAccessRequest(req.userId, req.params.id, req.body) });
});
