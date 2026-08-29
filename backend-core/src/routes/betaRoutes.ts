import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { betaMetrics, createBetaFeedback, createBetaInvite, getBetaAccess, redeemBetaInvite, replaceBetaInvite, revokeBetaInvite, updateBetaFeedbackStatus, updateBetaOnboarding } from "../services/betaService.js";
import { requireModerateMarketplaceCapability } from "../services/userCapabilityService.js";

export const betaRoutes = Router();

betaRoutes.get("/access", async (req, res) => { res.json({ access: await getBetaAccess(req.userId!) }); });
betaRoutes.post("/redeem", async (req, res) => { const body = z.object({ token: z.string().min(20).max(200) }).parse(req.body); res.json({ invite: await redeemBetaInvite({ userId: req.userId!, token: body.token }) }); });
betaRoutes.post("/onboarding", async (req, res) => {
  const body = z.object({ step: z.enum(["terms", "goals", "agent_installed", "connector_reviewed", "first_task", "approvals_understood", "support_found"]), completed: z.boolean(), goals: z.array(z.string()).max(10).optional() }).parse(req.body);
  res.json({ onboarding: await updateBetaOnboarding({ userId: req.userId!, ...body }) });
});
betaRoutes.post("/feedback", async (req, res) => {
  const body = z.object({ category: z.enum(["access", "connector", "provider", "privacy_security", "transaction", "usability", "other"]), severity: z.enum(["low", "medium", "high", "critical"]), expectedResult: z.string().trim().min(1).max(2000), actualResult: z.string().trim().min(1).max(2000), consentedDiagnostics: z.record(z.unknown()).optional(), contactPreference: z.enum(["none", "email"]).optional(), requestId: z.string().optional(), runId: z.string().optional(), transactionId: z.string().optional() }).parse(req.body);
  res.status(201).json({ feedback: await createBetaFeedback({ userId: req.userId!, ...body }) });
});

betaRoutes.get("/admin/invites", async (req, res) => { await requireModerateMarketplaceCapability(req.userId); res.json({ invites: await prisma.betaInvite.findMany({ orderBy: { createdAt: "desc" }, take: 200 }) }); });
betaRoutes.post("/admin/invites", async (req, res) => { const actor = await requireModerateMarketplaceCapability(req.userId); const body = z.object({ email: z.string(), cohort: z.string(), ttlDays: z.number().int().min(1).max(30).optional() }).parse(req.body); res.status(201).json(await createBetaInvite({ inviterUserId: actor.user.id, ...body })); });
betaRoutes.post("/admin/invites/:id/revoke", async (req, res) => { await requireModerateMarketplaceCapability(req.userId); res.json({ invite: await revokeBetaInvite(req.params.id) }); });
betaRoutes.post("/admin/invites/:id/replace", async (req, res) => { const actor = await requireModerateMarketplaceCapability(req.userId); res.status(201).json(await replaceBetaInvite({ inviteId: req.params.id, inviterUserId: actor.user.id })); });
betaRoutes.get("/admin/feedback", async (req, res) => { await requireModerateMarketplaceCapability(req.userId); const query = z.object({ status: z.string().optional(), severity: z.string().optional() }).parse(req.query); res.json({ feedback: await prisma.betaFeedback.findMany({ where: query, orderBy: { createdAt: "desc" }, take: 200 }) }); });
betaRoutes.patch("/admin/feedback/:id", async (req, res) => { await requireModerateMarketplaceCapability(req.userId); const body = z.object({ status: z.enum(["open", "triaged", "resolved"]) }).parse(req.body); res.json({ feedback: await updateBetaFeedbackStatus({ feedbackId: req.params.id, status: body.status }) }); });
betaRoutes.get("/admin/metrics", async (req, res) => { await requireModerateMarketplaceCapability(req.userId); const query = z.object({ cohort: z.string().optional() }).parse(req.query); res.json({ metrics: await betaMetrics(query.cohort) }); });
