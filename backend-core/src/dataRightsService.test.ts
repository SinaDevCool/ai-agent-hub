import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { cancelDeletionRequest, createDataRightsRequest, listDataRightsRequests } from "./services/dataRightsService.js";

const userId = `privacy-${Date.now()}`;
const originalEnabled = env.PRIVACY_RIGHTS_ENABLED;

before(async () => {
  env.PRIVACY_RIGHTS_ENABLED = "true";
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, role: "user", vaultLocalPath: "", vaultEncryptionSalt: "salt" } });
});

after(async () => {
  await prisma.durableJob.deleteMany({ where: { userId } });
  await prisma.dataRightsRequest.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  env.PRIVACY_RIGHTS_ENABLED = originalEnabled;
  await prisma.$disconnect();
});

test("export requests are canonical, queued, and deduplicated while active", async () => {
  const first = await createDataRightsRequest({ userId, requestType: "export" });
  const second = await createDataRightsRequest({ userId, requestType: "export" });
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(second.request.id, first.request.id);
  const job = await prisma.durableJob.findFirstOrThrow({ where: { aggregateId: first.request.id } });
  assert.equal(job.jobType, "privacy_export");
  assert.deepEqual(JSON.parse(job.payload), { requestId: first.request.id });
});

test("deletion requires explicit confirmation and receives a cancellable grace period", async () => {
  await assert.rejects(() => createDataRightsRequest({ userId, requestType: "deletion" }), /exact confirmation/i);
  const now = new Date("2026-08-29T12:00:00.000Z");
  const created = await createDataRightsRequest({ userId, requestType: "deletion", confirmation: "DELETE MY ACCOUNT", now });
  assert.equal(created.request.executeAfter.getTime(), now.getTime() + env.PRIVACY_DELETION_GRACE_HOURS * 3_600_000);
  const cancelled = await cancelDeletionRequest({ userId, requestId: created.request.id, now: new Date(now.getTime() + 60_000) });
  assert.equal(cancelled.status, "cancelled");
  const job = await prisma.durableJob.findFirstOrThrow({ where: { aggregateId: created.request.id } });
  assert.equal(job.status, "cancelled");
});

test("users can only list their own privacy requests", async () => {
  const requests = await listDataRightsRequests(userId);
  assert.ok(requests.length >= 2);
  assert.ok(requests.every((request) => request.id.length > 0));
  assert.deepEqual(await listDataRightsRequests("missing-user"), []);
});
