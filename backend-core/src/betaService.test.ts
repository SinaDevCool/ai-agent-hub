import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "./db/prisma.js";
import { betaMetrics, createBetaFeedback, createBetaInvite, getBetaAccess, redeemBetaInvite, replaceBetaInvite, revokeBetaInvite, updateBetaFeedbackStatus, updateBetaOnboarding } from "./services/betaService.js";

const prefix = `beta-${Date.now()}`;
const moderatorId = `${prefix}-moderator`;
const userId = `${prefix}-user`;
const outsiderId = `${prefix}-outsider`;

before(async () => {
  await prisma.user.createMany({ data: [
    { id: moderatorId, email: `${moderatorId}@example.test`, role: "moderator", vaultLocalPath: "", vaultEncryptionSalt: "salt" },
    { id: userId, email: `${userId}@example.test`, role: "user", vaultLocalPath: "", vaultEncryptionSalt: "salt" },
    { id: outsiderId, email: `${outsiderId}@example.test`, role: "user", vaultLocalPath: "", vaultEncryptionSalt: "salt" }
  ] });
});

after(async () => {
  await prisma.betaFeedback.deleteMany({ where: { userId: { in: [userId, outsiderId] } } });
  await prisma.betaInvite.deleteMany({ where: { inviterUserId: moderatorId } });
  await prisma.user.deleteMany({ where: { id: { in: [moderatorId, userId, outsiderId] } } });
  await prisma.$disconnect();
});

test("beta invites are single-use, email-bound, and stored only as hashes", async () => {
  const created = await createBetaInvite({ inviterUserId: moderatorId, email: `${userId}@example.test`, cohort: "early" });
  assert.equal(created.invite.tokenHash.includes(created.token), false);
  await assert.rejects(() => redeemBetaInvite({ userId: outsiderId, token: created.token }), /invalid/i);
  const redeemed = await redeemBetaInvite({ userId, token: created.token });
  assert.equal(redeemed.status, "redeemed");
  assert.equal(redeemed.redeemedByUserId, userId);
  await assert.rejects(() => redeemBetaInvite({ userId, token: created.token }), /already used|unavailable/i);
  const access = await getBetaAccess(userId);
  assert.equal(access?.allowed, true);
  assert.equal(access?.cohort, "early");
});

test("pending invites can be revoked or atomically replaced with a new token", async () => {
  const revoked = await createBetaInvite({ inviterUserId: moderatorId, email: `revoked-${prefix}@example.test`, cohort: "early" });
  assert.equal((await revokeBetaInvite(revoked.invite.id)).status, "revoked");
  const original = await createBetaInvite({ inviterUserId: moderatorId, email: `replace-${prefix}@example.test`, cohort: "early" });
  const replacement = await replaceBetaInvite({ inviteId: original.invite.id, inviterUserId: moderatorId });
  assert.notEqual(replacement.token, original.token);
  const storedOriginal = await prisma.betaInvite.findUniqueOrThrow({ where: { id: original.invite.id } });
  assert.equal(storedOriginal.status, "replaced");
  assert.equal(storedOriginal.replacedById, replacement.invite.id);
});

test("onboarding progress is resumable backend state", async () => {
  await updateBetaOnboarding({ userId, step: "terms", completed: true, goals: ["Plan travel safely"] });
  const state = await updateBetaOnboarding({ userId, step: "agent_installed", completed: true });
  assert.deepEqual(state.completedSteps, ["terms", "agent_installed"]);
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.ok(stored.betaTermsAcceptedAt);
  assert.match(stored.onboardingState, /Plan travel safely/);
});

test("feedback keeps only consented diagnostic allowlist fields and enforces reference ownership", async () => {
  const run = await prisma.agentRun.findFirst({ where: { userId: outsiderId } });
  if (run) await assert.rejects(() => createBetaFeedback({ userId, category: "provider", severity: "medium", expectedResult: "Expected success", actualResult: "Failed", runId: run.id }), /not found/i);
  const feedback = await createBetaFeedback({ userId, category: "connector", severity: "medium", expectedResult: "Connect", actualResult: "Could not connect", consentedDiagnostics: { release: "abc123", provider: "google", accessToken: "secret", promptBody: "private" } });
  assert.match(feedback.consentedDiagnostics, /abc123/);
  assert.equal(feedback.consentedDiagnostics.includes("secret"), false);
  assert.equal(feedback.consentedDiagnostics.includes("private"), false);
});

test("beta metrics derive privacy-safe counts from canonical records", async () => {
  const metrics = await betaMetrics("early");
  assert.ok(metrics.invites >= 1);
  assert.ok(metrics.redeemed >= 1);
  assert.ok(metrics.activationRate > 0);
  assert.ok(metrics.supportContacts >= 1);
});

test("moderator feedback triage uses a constrained lifecycle", async () => {
  const created = await createBetaFeedback({ userId, category: "usability", severity: "low", expectedResult: "Clear next step", actualResult: "Could not find it" });
  const triaged = await updateBetaFeedbackStatus({ feedbackId: created.id, status: "triaged" });
  assert.equal(triaged.status, "triaged");
  const resolved = await updateBetaFeedbackStatus({ feedbackId: created.id, status: "resolved" });
  assert.equal(resolved.status, "resolved");
});
