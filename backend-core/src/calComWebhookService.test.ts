import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test, { after, before } from "node:test";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { acceptCalComWebhook, registerCalComWebhookJobHandler } from "./services/calComWebhookService.js";
import { processDurableJobBatch } from "./services/durableJobService.js";

const userId = `cal-webhook-${Date.now()}`;
const original = { live: env.LIVE_APPOINTMENTS_ENABLED, secret: env.CALCOM_WEBHOOK_SECRET, jobs: env.DURABLE_JOBS_ENABLED };
before(async () => { env.LIVE_APPOINTMENTS_ENABLED = "true"; env.CALCOM_WEBHOOK_SECRET = "test-calcom-webhook-secret-long-enough"; env.DURABLE_JOBS_ENABLED = "true"; registerCalComWebhookJobHandler(); await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "salt" } }); });
after(async () => { await prisma.durableJob.deleteMany({ where: { userId } }); await prisma.appointment.deleteMany({ where: { userId } }); await prisma.lifeTransaction.deleteMany({ where: { userId } }); await prisma.user.delete({ where: { id: userId } }); env.LIVE_APPOINTMENTS_ENABLED = original.live; env.CALCOM_WEBHOOK_SECRET = original.secret; env.DURABLE_JOBS_ENABLED = original.jobs; await prisma.$disconnect(); });
function signed(body: Buffer) { return createHmac("sha256", env.CALCOM_WEBHOOK_SECRET!).update(body).digest("hex"); }

test("Cal.com webhook verifies signature, rejects replay, and deduplicates delivery", async () => {
  const now = new Date(); const body = Buffer.from(JSON.stringify({ triggerEvent: "BOOKING_CREATED", createdAt: now.toISOString(), payload: { uid: "book-webhook-1", startTime: "2030-01-01T10:00:00Z", endTime: "2030-01-01T10:30:00Z", metadata: { agentHubUserId: userId, agentHubIdempotencyKey: "cal-webhook-booking-1" } } }));
  assert.equal((await acceptCalComWebhook({ rawBody: body, signature: "bad", now })).status, 401);
  const staleBody = Buffer.from(JSON.stringify({ triggerEvent: "BOOKING_CREATED", createdAt: new Date(now.valueOf() - 60 * 60_000).toISOString(), payload: { uid: "stale", metadata: { agentHubUserId: userId } } }));
  assert.equal((await acceptCalComWebhook({ rawBody: staleBody, signature: signed(staleBody), now })).status, 409);
  const first = await acceptCalComWebhook({ rawBody: body, signature: signed(body), now }); const second = await acceptCalComWebhook({ rawBody: body, signature: signed(body), now });
  assert.equal(first.accepted, true); assert.equal(second.deduplicated, true);
  await prisma.appointment.create({ data: { userId, providerId: "cal-com", externalProviderId: "book-webhook-1", providerName: "Cal.com appointment", specialty: "Appointment", location: "Online", startsAt: new Date("2030-01-01T10:00:00Z"), endsAt: new Date("2030-01-01T10:30:00Z"), status: "requested", idempotencyKey: "cal-webhook-booking-1" } });
  await processDurableJobBatch("cal-webhook-test-worker");
  const appointment = await prisma.appointment.findFirstOrThrow({ where: { userId, externalProviderId: "book-webhook-1" } });
  assert.equal(appointment.status, "confirmed");
  assert.equal(await prisma.durableJob.count({ where: { userId, jobType: "calcom_reconciliation" } }), 1);
  const uncorrelated = Buffer.from(JSON.stringify({ triggerEvent: "BOOKING_CREATED", createdAt: now.toISOString(), payload: { uid: "book-uncorrelated", metadata: { agentHubUserId: userId, agentHubIdempotencyKey: "cal-webhook-uncorrelated" } } }));
  assert.equal((await acceptCalComWebhook({ rawBody: uncorrelated, signature: signed(uncorrelated), now })).accepted, true);
  await processDurableJobBatch("cal-webhook-test-worker-uncorrelated");
  assert.equal(await prisma.appointment.count({ where: { userId, externalProviderId: "book-uncorrelated" } }), 0);
  assert.equal(await prisma.durableJob.count({ where: { userId, jobType: "calcom_reconciliation", aggregateId: "book-uncorrelated" } }), 1);
});
