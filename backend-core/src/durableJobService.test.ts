import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { z } from "zod";
import { prisma } from "./db/prisma.js";
import {
  claimDurableJobs,
  enqueueDurableJob,
  executeClaimedDurableJob,
  heartbeatDurableJob,
  processDurableJobBatch,
  recoverExpiredDurableJobLeases,
  registerDurableJobHandler,
  retryDeadLetterDurableJob,
  unregisterDurableJobHandler
} from "./services/durableJobService.js";

const prefix = `durable-job-${Date.now()}`;

beforeEach(async () => {
  await prisma.durableJob.deleteMany({ where: { dedupeKey: { startsWith: prefix } } });
  unregisterDurableJobHandler("provider_health_check");
  unregisterDurableJobHandler("provider_webhook");
});

after(async () => {
  await prisma.durableJob.deleteMany({ where: { dedupeKey: { startsWith: prefix } } });
  await prisma.$disconnect();
});

test("enqueue deduplicates one logical job and redacts sensitive payload keys", async () => {
  const key = `${prefix}:dedupe`;
  const first = await enqueueDurableJob({ jobType: "provider_health_check", dedupeKey: key, payload: { providerId: "demo", accessToken: "never-store", nested: { password: "hidden", safe: "yes" } } });
  const second = await enqueueDurableJob({ jobType: "provider_health_check", dedupeKey: key, payload: { providerId: "changed" } });
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(second.job.id, first.job.id);
  assert.equal(first.job.payload.includes("never-store"), false);
  assert.equal(first.job.payload.includes("hidden"), false);
  assert.match(first.job.payload, /providerId/);
});

test("concurrent workers cannot claim the same durable job", async () => {
  await enqueueDurableJob({ jobType: "provider_health_check", dedupeKey: `${prefix}:claim`, payload: {} });
  const [a, b] = await Promise.all([
    claimDurableJobs({ workerId: "worker-a", limit: 1 }),
    claimDurableJobs({ workerId: "worker-b", limit: 1 })
  ]);
  assert.equal(a.length + b.length, 1);
  assert.notEqual(a[0]?.leaseOwner, b[0]?.leaseOwner);
});

test("heartbeats require the current lease owner and expired leases are recovered", async () => {
  const queued = await enqueueDurableJob({ jobType: "provider_health_check", dedupeKey: `${prefix}:lease`, payload: {} });
  const [claimed] = await claimDurableJobs({ workerId: "lease-owner", limit: 1, leaseMs: 5000 });
  assert.equal(claimed.id, queued.job.id);
  assert.equal(await heartbeatDurableJob(claimed.id, "wrong-owner"), false);
  assert.equal(await heartbeatDurableJob(claimed.id, "lease-owner"), true);
  await prisma.durableJob.update({ where: { id: claimed.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await recoverExpiredDurableJobLeases()).count, 1);
  const recovered = await prisma.durableJob.findUniqueOrThrow({ where: { id: claimed.id } });
  assert.equal(recovered.status, "retry_scheduled");
  assert.equal(recovered.leaseOwner, null);
});

test("retryable failures back off and eventually dead-letter", async () => {
  registerDurableJobHandler("provider_health_check", {
    version: 1,
    schema: z.object({ providerId: z.string() }),
    execute: async () => ({ outcome: "retry", classification: "transient", message: "provider unavailable", retryAfterMs: 1 })
  });
  const created = await enqueueDurableJob({ jobType: "provider_health_check", dedupeKey: `${prefix}:retry`, payload: { providerId: "demo" }, maxAttempts: 2 });
  let [job] = await claimDurableJobs({ workerId: "retry-worker", limit: 1 });
  await executeClaimedDurableJob(job, "retry-worker");
  let stored = await prisma.durableJob.findUniqueOrThrow({ where: { id: created.job.id } });
  assert.equal(stored.status, "retry_scheduled");
  await prisma.durableJob.update({ where: { id: stored.id }, data: { scheduledAt: new Date(Date.now() - 1) } });
  [job] = await claimDurableJobs({ workerId: "retry-worker", limit: 1 });
  await executeClaimedDurableJob(job, "retry-worker");
  stored = await prisma.durableJob.findUniqueOrThrow({ where: { id: created.job.id } });
  assert.equal(stored.status, "dead_letter");
  assert.equal(stored.attemptCount, 2);
});

test("uncertain provider writes enqueue reconciliation instead of resubmitting", async () => {
  let executions = 0;
  registerDurableJobHandler("provider_webhook", {
    version: 1,
    schema: z.object({ externalReference: z.string() }),
    execute: async () => {
      executions += 1;
      return { outcome: "uncertain", message: "Timed out after provider accepted the request." };
    }
  });
  const source = await enqueueDurableJob({
    jobType: "provider_webhook",
    dedupeKey: `${prefix}:uncertain`,
    payload: { externalReference: "external-1" },
    aggregateType: "life_transaction",
    aggregateId: "transaction-1"
  });
  const [claimed] = await claimDurableJobs({ workerId: "uncertain-worker", limit: 1 });
  await executeClaimedDurableJob(claimed, "uncertain-worker");
  const stored = await prisma.durableJob.findUniqueOrThrow({ where: { id: source.job.id } });
  const reconciliation = await prisma.durableJob.findUnique({ where: { dedupeKey: `${prefix}:uncertain:reconcile` } });
  assert.equal(stored.status, "reconciliation_required");
  assert.equal(executions, 1);
  assert.equal(reconciliation?.jobType, "provider_reconciliation");
  assert.equal(reconciliation?.aggregateId, "transaction-1");
});

test("operator dead-letter retry requires a type-specific safety validator", async () => {
  registerDurableJobHandler("provider_health_check", {
    version: 1,
    schema: z.object({ providerId: z.string() }),
    execute: async () => ({ outcome: "permanent", message: "invalid provider" })
  });
  const created = await enqueueDurableJob({ jobType: "provider_health_check", dedupeKey: `${prefix}:operator`, payload: { providerId: "demo" } });
  const [claimed] = await claimDurableJobs({ workerId: "operator-worker", limit: 1 });
  await executeClaimedDurableJob(claimed, "operator-worker");
  await assert.rejects(() => retryDeadLetterDurableJob(created.job.id), /not safe/i);

  registerDurableJobHandler("provider_health_check", {
    version: 1,
    schema: z.object({ providerId: z.string() }),
    execute: async () => ({ outcome: "succeeded" }),
    canRetryDeadLetter: ({ payload }) => z.object({ providerId: z.string() }).safeParse(payload).success
  });
  const retried = await retryDeadLetterDurableJob(created.job.id);
  assert.equal(retried.status, "retry_scheduled");
  assert.equal(retried.attemptCount, 0);
});

test("worker processing remains disabled until the feature flag is activated", async () => {
  const result = await processDurableJobBatch("disabled-worker");
  assert.deepEqual(result, { enabled: false, claimed: 0 });
});
