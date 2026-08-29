import { Router } from "express";
import { z } from "zod";
import { httpError } from "../errors/httpError.js";
import {
  completeGoogleOAuth,
  completeMicrosoftOAuth,
  disconnectConnectedAccount,
  getConnectorStartState,
  listConnectedAccounts,
  connectorCapabilityKeys
} from "../services/connectorAccountService.js";
import { env } from "../config/env.js";
import { listProviderDiscovery } from "../services/providerDiscoveryService.js";
import { getProviderHealthForUser, getProviderReadinessSummary } from "../services/providerHealthService.js";

export const connectorRoutes = Router();
export const publicConnectorRoutes = Router();

const providerParams = z.object({ provider: z.string().min(1).max(64) });
const accountParams = z.object({ accountId: z.string().min(1) });
const connectorStartSchema = z.object({
  capabilities: z.array(z.enum(connectorCapabilityKeys)).min(1).max(connectorCapabilityKeys.length).optional()
});
const googleCallbackSchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional()
});

function frontendConnectorRedirect(status: "success" | "error", message: string) {
  const base = env.FRONTEND_ORIGIN.split(",")[0]?.trim() || "http://localhost:5173";
  const url = new URL(base);
  url.pathname = "/settings";
  url.searchParams.set("connector", status);
  url.searchParams.set("message", message);
  return url.toString();
}

publicConnectorRoutes.get("/google/callback", async (req, res) => {
  try {
    const query = googleCallbackSchema.parse(req.query);
    if (query.error) {
      return res.redirect(frontendConnectorRedirect("error", "Google connection was cancelled."));
    }
    if (!query.code || !query.state) {
      return res.redirect(frontendConnectorRedirect("error", "Google connection response was incomplete."));
    }
    await completeGoogleOAuth({ code: query.code, state: query.state });
    return res.redirect(frontendConnectorRedirect("success", "Google connected."));
  } catch {
    return res.redirect(frontendConnectorRedirect("error", "Google could not be connected. Please try again."));
  }
});

publicConnectorRoutes.get("/microsoft/callback", async (req, res) => {
  try {
    const query = googleCallbackSchema.parse(req.query);
    if (query.error) return res.redirect(frontendConnectorRedirect("error", "Microsoft connection was cancelled."));
    if (!query.code || !query.state) return res.redirect(frontendConnectorRedirect("error", "Microsoft connection response was incomplete."));
    await completeMicrosoftOAuth({ code: query.code, state: query.state });
    return res.redirect(frontendConnectorRedirect("success", "Microsoft connected."));
  } catch {
    return res.redirect(frontendConnectorRedirect("error", "Microsoft could not be connected. Please try again."));
  }
});

connectorRoutes.get("/", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  res.json({ accounts: await listConnectedAccounts(req.userId) });
});

connectorRoutes.get("/providers", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  res.json(await listProviderDiscovery({ userId: req.userId }));
});

connectorRoutes.get("/providers/readiness", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const query = z.object({
    agentId: z.string().min(1).optional(),
    capabilityKey: z.string().min(1).optional(),
    providerId: z.string().min(1).optional()
  }).parse(req.query);
  res.json({
    readiness: await getProviderHealthForUser({
      userId: req.userId,
      agentId: query.agentId,
      capabilityKey: query.capabilityKey,
      providerId: query.providerId
    })
  });
});

connectorRoutes.get("/providers/readiness/summary", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const query = z.object({
    agentId: z.string().min(1).optional(),
    capabilityKey: z.string().min(1).optional(),
    providerId: z.string().min(1).optional()
  }).parse(req.query);
  res.json({
    summary: await getProviderReadinessSummary({
      userId: req.userId,
      agentId: query.agentId,
      capabilityKey: query.capabilityKey,
      providerId: query.providerId
    })
  });
});

connectorRoutes.post("/:provider/start", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const { provider } = providerParams.parse(req.params);
  const { capabilities } = connectorStartSchema.parse(req.body ?? {});
  const state = await getConnectorStartState(provider, req.userId, capabilities);
  // Readiness is an expected product state, not a transport failure. Returning
  // 200 lets clients show the provider-specific setup guidance verbatim.
  res.json(state);
});

connectorRoutes.delete("/:accountId", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const { accountId } = accountParams.parse(req.params);
  const disconnected = await disconnectConnectedAccount({ userId: req.userId, accountId });
  if (!disconnected) throw httpError(404, "Connected account not found", "connected_account_not_found");
  res.json({ ok: true });
});
