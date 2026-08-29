import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";
import { sha256 } from "./cryptoService.js";
import { decodeJson, encodeJson } from "./jsonService.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const onboardingSteps = ["terms", "goals", "agent_installed", "connector_reviewed", "first_task", "approvals_understood", "support_found"] as const;
type OnboardingStep = typeof onboardingSteps[number];

function limits(): Record<string, number> {
  try { return JSON.parse(env.BETA_COHORT_LIMITS) as Record<string, number>; } catch { return {}; }
}

function normalizedEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!emailPattern.test(email) || email.length > 254) throw httpError(400, "A valid invite email is required.", "invalid_beta_invite_email");
  return email;
}

export async function createBetaInvite(input: { inviterUserId: string; email: string; cohort: string; ttlDays?: number }) {
  const email = normalizedEmail(input.email);
  const cohort = input.cohort.trim().toLowerCase();
  const limit = limits()[cohort];
  if (!cohort || !Number.isInteger(limit) || limit < 1) throw httpError(400, "Choose a configured beta cohort.", "invalid_beta_cohort");
  const token = randomBytes(32).toString("base64url");
  const invite = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const activeCount = await tx.betaInvite.count({ where: { cohort, status: { in: ["pending", "redeemed"] }, expiresAt: { gt: now } } });
    if (activeCount >= limit) throw httpError(409, "This beta cohort has reached its configured limit.", "beta_cohort_full");
    const existing = await tx.betaInvite.findFirst({ where: { email, cohort, status: "pending", expiresAt: { gt: now } } });
    if (existing) throw httpError(409, "An active invite already exists for this email and cohort.", "beta_invite_exists");
    return tx.betaInvite.create({ data: { tokenHash: sha256(token), email, cohort, inviterUserId: input.inviterUserId, expiresAt: new Date(now.getTime() + Math.max(1, Math.min(30, input.ttlDays ?? 7)) * 86_400_000) } });
  }, { isolationLevel: "Serializable" });
  return { invite, token };
}

export async function revokeBetaInvite(inviteId: string) {
  const result = await prisma.betaInvite.updateMany({ where: { id: inviteId, status: "pending" }, data: { status: "revoked", revokedAt: new Date() } });
  if (result.count !== 1) throw httpError(409, "Only pending beta invites can be revoked.", "beta_invite_not_revocable");
  return prisma.betaInvite.findUniqueOrThrow({ where: { id: inviteId } });
}

export async function replaceBetaInvite(input: { inviteId: string; inviterUserId: string }) {
  const original = await prisma.betaInvite.findUnique({ where: { id: input.inviteId } });
  if (!original || original.status !== "pending") throw httpError(409, "Only pending beta invites can be replaced.", "beta_invite_not_replaceable");
  const token = randomBytes(32).toString("base64url");
  const invite = await prisma.$transaction(async (tx) => {
    const changed = await tx.betaInvite.updateMany({ where: { id: original.id, status: "pending" }, data: { status: "replaced", revokedAt: new Date() } });
    if (changed.count !== 1) throw httpError(409, "This invite changed before it could be replaced.", "beta_invite_not_replaceable");
    const replacement = await tx.betaInvite.create({ data: { tokenHash: sha256(token), email: original.email, cohort: original.cohort, inviterUserId: input.inviterUserId, expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
    await tx.betaInvite.update({ where: { id: original.id }, data: { replacedById: replacement.id } });
    return replacement;
  }, { isolationLevel: "Serializable" });
  return { invite, token };
}

export async function redeemBetaInvite(input: { userId: string; token: string }) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw httpError(404, "User was not found.", "user_not_found");
  const tokenHash = sha256(input.token.trim());
  const invite = await prisma.betaInvite.findUnique({ where: { tokenHash } });
  if (!invite || invite.email !== user.email.trim().toLowerCase()) throw httpError(400, "This beta invite is invalid for the signed-in account.", "invalid_beta_invite");
  const result = await prisma.betaInvite.updateMany({ where: { id: invite.id, status: "pending", expiresAt: { gt: new Date() }, redeemedByUserId: null }, data: { status: "redeemed", redeemedByUserId: user.id, redeemedAt: new Date() } });
  if (result.count !== 1) throw httpError(409, "This beta invite was already used, revoked, or expired.", "beta_invite_unavailable");
  return prisma.betaInvite.findUniqueOrThrow({ where: { id: invite.id } });
}

export async function getBetaAccess(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, betaTermsAcceptedAt: true, onboardingState: true } });
  if (!user) return null;
  const invite = await prisma.betaInvite.findFirst({ where: { redeemedByUserId: userId, status: "redeemed" }, orderBy: { redeemedAt: "desc" } });
  const privileged = user.role === "admin" || user.role === "moderator";
  return { enforced: env.PRIVATE_BETA_ENFORCED === "true", allowed: privileged || Boolean(invite), privileged, cohort: invite?.cohort ?? (privileged ? "team" : null), termsAcceptedAt: user.betaTermsAcceptedAt, onboarding: decodeJson<Record<string, unknown>>(user.onboardingState, {}) };
}

export async function updateBetaOnboarding(input: { userId: string; step: OnboardingStep; completed: boolean; goals?: string[] }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  const state = decodeJson<Record<string, unknown>>(user.onboardingState, {});
  const completedSteps = new Set(Array.isArray(state.completedSteps) ? state.completedSteps.map(String) : []);
  if (input.completed) completedSteps.add(input.step); else completedSteps.delete(input.step);
  const next = { completedSteps: [...completedSteps].filter((step) => onboardingSteps.includes(step as OnboardingStep)), goals: input.goals?.slice(0, 10).map((goal) => goal.slice(0, 80)) ?? state.goals ?? [], updatedAt: new Date().toISOString() };
  const data = { onboardingState: encodeJson(next), ...(input.step === "terms" && input.completed ? { betaTermsAcceptedAt: new Date() } : {}) };
  await prisma.user.update({ where: { id: input.userId }, data });
  return next;
}

export async function createBetaFeedback(input: { userId: string; category: string; severity: string; expectedResult: string; actualResult: string; consentedDiagnostics?: Record<string, unknown>; contactPreference?: string; requestId?: string; runId?: string; transactionId?: string }) {
  if (input.runId && !await prisma.agentRun.findFirst({ where: { id: input.runId, userId: input.userId }, select: { id: true } })) throw httpError(400, "The referenced run was not found.", "feedback_reference_invalid");
  if (input.transactionId && !await prisma.lifeTransaction.findFirst({ where: { id: input.transactionId, userId: input.userId }, select: { id: true } })) throw httpError(400, "The referenced transaction was not found.", "feedback_reference_invalid");
  if (input.requestId && !await prisma.hitlRequest.findFirst({ where: { id: input.requestId, userId: input.userId }, select: { id: true } })) throw httpError(400, "The referenced request was not found.", "feedback_reference_invalid");
  const safeDiagnostics = Object.fromEntries(Object.entries(input.consentedDiagnostics ?? {}).filter(([key, value]) => /^(release|environment|provider|capability|errorCode|requestId)$/i.test(key) && ["string", "number", "boolean"].includes(typeof value)));
  return prisma.betaFeedback.create({ data: { userId: input.userId, category: input.category, severity: input.severity, expectedResult: input.expectedResult.slice(0, 2000), actualResult: input.actualResult.slice(0, 2000), consentedDiagnostics: encodeJson(safeDiagnostics), contactPreference: input.contactPreference ?? "none", requestId: input.requestId, runId: input.runId, transactionId: input.transactionId } });
}

export async function updateBetaFeedbackStatus(input: { feedbackId: string; status: "open" | "triaged" | "resolved" }) {
  const result = await prisma.betaFeedback.updateMany({ where: { id: input.feedbackId }, data: { status: input.status } });
  if (result.count !== 1) throw httpError(404, "Beta feedback was not found.", "beta_feedback_not_found");
  return prisma.betaFeedback.findUniqueOrThrow({ where: { id: input.feedbackId } });
}

export async function betaMetrics(cohort?: string) {
  const inviteWhere = cohort ? { cohort } : {};
  const redeemed = await prisma.betaInvite.findMany({ where: { ...inviteWhere, status: "redeemed" }, select: { redeemedByUserId: true, redeemedAt: true, createdAt: true } });
  const userIds = redeemed.map((item) => item.redeemedByUserId).filter((id): id is string => Boolean(id));
  const userWhere = userIds.length ? { userId: { in: userIds } } : { userId: { in: ["__none__"] } };
  const [invites, installs, successfulRuns, approvals, transactions, feedback] = await Promise.all([
    prisma.betaInvite.count({ where: inviteWhere }),
    prisma.userAgentInstall.count({ where: userWhere }),
    prisma.agentRun.count({ where: { ...userWhere, status: "succeeded" } }),
    prisma.hitlRequest.groupBy({ by: ["status"], where: userWhere, _count: { _all: true } }),
    prisma.lifeTransaction.groupBy({ by: ["state"], where: userWhere, _count: { _all: true } }),
    prisma.betaFeedback.count({ where: userIds.length ? { userId: { in: userIds } } : { userId: "__none__" } })
  ]);
  return { cohort: cohort ?? "all", invites, redeemed: redeemed.length, activationRate: invites ? redeemed.length / invites : 0, installs, successfulRuns, approvals: Object.fromEntries(approvals.map((item) => [item.status, item._count._all])), transactions: Object.fromEntries(transactions.map((item) => [item.state, item._count._all])), supportContacts: feedback };
}
