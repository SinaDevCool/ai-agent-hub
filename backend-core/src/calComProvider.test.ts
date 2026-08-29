import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { getConnectorCapability } from "./services/connectorCapabilityService.js";
import { calComProvider, resetCalComFetchForTest, setCalComFetchForTest } from "./services/providers/calComProvider.js";

const original = env.LIVE_APPOINTMENTS_ENABLED;
afterEach(() => { resetCalComFetchForTest(); env.LIVE_APPOINTMENTS_ENABLED = original; });
function capability(key: string) { const value = getConnectorCapability(key); assert.ok(value); return value; }
const connection = { id: "c", status: "active", displayName: "Cal.com", credentials: { accessToken: "cal_test" } };

test("Cal.com availability stays disabled until explicitly enabled", async () => {
  env.LIVE_APPOINTMENTS_ENABLED = "false";
  const result = await calComProvider.execute({ userId: "u", agentId: "a", capability: capability("appointments.availability.search"), action: "search", input: { start: "2030-01-01", end: "2030-01-02", eventTypeId: 1 }, attempt: 1, providerConnection: connection });
  assert.equal(result.status, "blocked");
});

test("Cal.com booking uses current API version, approval reference, and idempotency", async () => {
  env.LIVE_APPOINTMENTS_ENABLED = "true";
  const userId = `cal-provider-${Date.now()}`;
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "salt" } });
  let request: { url: string; init?: RequestInit } | undefined;
  setCalComFetchForTest(async (url, init) => { request = { url: String(url), init }; return new Response(JSON.stringify({ status: "success", data: { uid: "book_1", status: "accepted" } }), { status: 201, headers: { "Content-Type": "application/json" } }); });
  const result = await calComProvider.execute({ userId, agentId: "a", capability: capability("appointments.booking.manage"), action: "reserve", input: { start: "2030-01-01T10:00:00Z", eventTypeId: 1, attendee: { name: "Test User", email: "user@example.test", timeZone: "Europe/Berlin", language: "en" }, approvalRequestId: "approval-1" }, idempotencyKey: "booking-1", attempt: 1, providerConnection: connection });
  assert.equal(result.status, "ok");
  assert.match(request?.url ?? "", /\/v2\/bookings$/);
  const headers = request?.init?.headers as Record<string, string>;
  assert.equal(headers["cal-api-version"], "2026-02-25");
  assert.equal(headers["Idempotency-Key"], "booking-1");
  assert.match(String(request?.init?.body), /approval-1/);
  assert.equal((await prisma.appointment.findFirstOrThrow({ where: { userId } })).externalProviderId, "book_1");
  const stale = await calComProvider.execute({ userId, agentId: "a", capability: capability("appointments.booking.manage"), action: "execute_action", input: { bookingUid: "book_1", newStart: "2030-01-02T10:00:00Z", slotValidatedAt: "2020-01-01T00:00:00Z", approvalRequestId: "approval-2" }, idempotencyKey: "reschedule-1", attempt: 1, providerConnection: connection });
  assert.equal(stale.status, "blocked");
  setCalComFetchForTest(async () => new Response(JSON.stringify({ status: "success", data: { uid: "book_2", status: "accepted", start: "2030-01-02T10:00:00Z", end: "2030-01-02T10:30:00Z" } }), { status: 201, headers: { "Content-Type": "application/json" } }));
  const rescheduled = await calComProvider.execute({ userId, agentId: "a", capability: capability("appointments.booking.manage"), action: "execute_action", input: { bookingUid: "book_1", newStart: "2030-01-02T10:00:00Z", slotValidatedAt: new Date().toISOString(), approvalRequestId: "approval-2" }, idempotencyKey: "reschedule-1", attempt: 1, providerConnection: connection });
  assert.equal(rescheduled.status, "ok"); assert.equal(await prisma.appointment.count({ where: { userId } }), 1); assert.equal((await prisma.appointment.findFirstOrThrow({ where: { userId } })).externalProviderId, "book_2");
  setCalComFetchForTest(async () => new Response(JSON.stringify({ status: "success", data: { uid: "book_2", status: "cancelled" } }), { status: 200, headers: { "Content-Type": "application/json" } }));
  const cancelled = await calComProvider.execute({ userId, agentId: "a", capability: capability("appointments.booking.manage"), action: "cancel", input: { bookingUid: "book_2", approvalRequestId: "approval-3" }, idempotencyKey: "cancel-1", attempt: 1, providerConnection: connection });
  assert.equal(cancelled.status, "ok"); assert.equal((await prisma.appointment.findFirstOrThrow({ where: { userId } })).status, "cancelled");
  await prisma.appointment.deleteMany({ where: { userId } }); await prisma.lifeTransaction.deleteMany({ where: { userId } }); await prisma.user.delete({ where: { id: userId } });
});

test("Cal.com transient network failures remain retryable", async () => {
  env.LIVE_APPOINTMENTS_ENABLED = "true";
  setCalComFetchForTest(async () => { throw new Error("network unavailable"); });
  const result = await calComProvider.execute({ userId: "u", agentId: "a", capability: capability("appointments.booking.manage"), action: "sync_status", input: { bookingUid: "book_timeout" }, attempt: 1, providerConnection: connection });
  assert.equal(result.status, "blocked");
  if (result.status === "blocked") { assert.equal(result.code, "provider_error"); assert.equal(result.retryable, true); }
});
