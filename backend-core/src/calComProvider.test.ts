import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { env } from "./config/env.js";
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
  let request: { url: string; init?: RequestInit } | undefined;
  setCalComFetchForTest(async (url, init) => { request = { url: String(url), init }; return new Response(JSON.stringify({ status: "success", data: { uid: "book_1", status: "accepted" } }), { status: 201, headers: { "Content-Type": "application/json" } }); });
  const result = await calComProvider.execute({ userId: "u", agentId: "a", capability: capability("appointments.booking.manage"), action: "reserve", input: { start: "2030-01-01T10:00:00Z", eventTypeId: 1, attendee: { name: "Test User", email: "user@example.test", timeZone: "Europe/Berlin", language: "en" }, approvalRequestId: "approval-1" }, idempotencyKey: "booking-1", attempt: 1, providerConnection: connection });
  assert.equal(result.status, "ok");
  assert.match(request?.url ?? "", /\/v2\/bookings$/);
  const headers = request?.init?.headers as Record<string, string>;
  assert.equal(headers["cal-api-version"], "2026-02-25");
  assert.equal(headers["Idempotency-Key"], "booking-1");
  assert.match(String(request?.init?.body), /approval-1/);
});
