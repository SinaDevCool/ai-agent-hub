import { Router } from "express";
import { z } from "zod";
import { httpError } from "../errors/httpError.js";
import {
  createProviderConnection,
  deleteProviderConnection,
  listProviderConnections,
  refreshProviderConnection,
  testProviderConnection,
  updateProviderConnection,
  validateProviderConnection
} from "../services/providerConnectionService.js";
import { completeProviderOAuth, startProviderOAuth } from "../services/providerOAuthService.js";

export const providerConnectionRoutes = Router();
export const publicProviderConnectionRoutes = Router();

const connectionParams = z.object({ connectionId: z.string().min(1) });
const providerParams = z.object({ providerId: z.string().min(1).max(120) });
const statusSchema = z.enum(["active", "refreshing", "expired", "reconnect_required", "revoked", "error", "disabled"]);
const credentialsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));
const callbackSchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional()
});

const createConnectionSchema = z.object({
  providerId: z.string().min(1).max(80),
  displayName: z.string().max(120).optional(),
  credentials: credentialsSchema,
  scopes: z.array(z.string().max(120)).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  expiresAt: z.coerce.date().optional(),
  refreshAfter: z.coerce.date().optional(),
  externalAccountId: z.string().max(180).optional(),
  externalAccountLabel: z.string().max(180).optional()
});

const updateConnectionSchema = z.object({
  displayName: z.string().max(120).optional(),
  credentials: credentialsSchema.optional(),
  scopes: z.array(z.string().max(120)).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  status: statusSchema.optional(),
  expiresAt: z.coerce.date().optional(),
  refreshAfter: z.coerce.date().optional(),
  externalAccountId: z.string().max(180).optional(),
  externalAccountLabel: z.string().max(180).optional()
});

publicProviderConnectionRoutes.get("/oauth/callback", async (req, res, next) => {
  try {
    const query = callbackSchema.parse(req.query);
    if (query.error) return res.status(400).json({ error: { message: "Provider connection was cancelled." } });
    res.json(await completeProviderOAuth(query));
  } catch (error) {
    next(error);
  }
});

providerConnectionRoutes.get("/", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  res.json({ connections: await listProviderConnections(req.userId) });
});

providerConnectionRoutes.post("/", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const body = createConnectionSchema.parse(req.body);
  const connection = await createProviderConnection({ userId: req.userId, ...body });
  res.status(201).json({ connection });
});

providerConnectionRoutes.post("/:providerId/oauth/start", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const { providerId } = providerParams.parse(req.params);
  res.json(startProviderOAuth({ userId: req.userId, providerId }));
});

providerConnectionRoutes.patch("/:connectionId", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const { connectionId } = connectionParams.parse(req.params);
  const body = updateConnectionSchema.parse(req.body);
  const connection = await updateProviderConnection({ userId: req.userId, connectionId, ...body });
  res.json({ connection });
});

providerConnectionRoutes.post("/:connectionId/validate", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const { connectionId } = connectionParams.parse(req.params);
  const connection = await validateProviderConnection({ userId: req.userId, connectionId });
  res.json({ connection });
});

providerConnectionRoutes.post("/:connectionId/test", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const { connectionId } = connectionParams.parse(req.params);
  res.json(await testProviderConnection({ userId: req.userId, connectionId }));
});

providerConnectionRoutes.post("/:connectionId/refresh", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const { connectionId } = connectionParams.parse(req.params);
  const connection = await refreshProviderConnection({ userId: req.userId, connectionId });
  res.json({ connection });
});

providerConnectionRoutes.delete("/:connectionId", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const { connectionId } = connectionParams.parse(req.params);
  const deleted = await deleteProviderConnection({ userId: req.userId, connectionId });
  if (!deleted) throw httpError(404, "Provider connection not found.", "provider_connection_not_found");
  res.json({ ok: true });
});
