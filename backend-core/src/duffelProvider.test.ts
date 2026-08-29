import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { getConnectorCapability } from "./services/connectorCapabilityService.js";
import { duffelProvider, resetDuffelFetchForTest, setDuffelFetchForTest } from "./services/providers/duffelProvider.js";

afterEach(resetDuffelFetchForTest);
function capability(key: string) { const value = getConnectorCapability(key); assert.ok(value); return value; }
const connection = { id: "c", status: "active", displayName: "Duffel", credentials: { accessToken: "test-token" } };

test("Duffel search sends its version and bearer token and returns normalized provider data", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  setDuffelFetchForTest(async (url, init) => { request = { url: String(url), init }; return new Response(JSON.stringify({ data: { offers: [{ id: "off_1" }] } }), { status: 200, headers: { "Content-Type": "application/json" } }); });
  const result = await duffelProvider.execute({ userId: "u", agentId: "a", capability: capability("travel.flight.search"), action: "search", input: { origin: "BER", destination: "LHR", departureDate: "2030-01-01" }, attempt: 1, providerConnection: connection });
  assert.equal(result.status, "ok");
  assert.match(request?.url ?? "", /offer_requests/);
  assert.equal((request?.init?.headers as Record<string, string>).Authorization, "Bearer test-token");
  assert.equal((request?.init?.headers as Record<string, string>)["Duffel-Version"], "v2");
});

test("Duffel booking requires approval and an idempotency key", async () => {
  const base = { userId: "u", agentId: "a", capability: capability("travel.flight.book"), action: "reserve" as const, input: { offerId: "off_1", passengers: [{ id: "pas_1" }], approvalRequestId: "approval-1" }, attempt: 1, providerConnection: connection };
  const missingKey = await duffelProvider.execute(base);
  assert.equal(missingKey.status, "blocked");
  let key = "";
  setDuffelFetchForTest(async (_url, init) => { key = (init?.headers as Record<string, string>)["Idempotency-Key"]; return new Response(JSON.stringify({ data: { id: "ord_1", booking_reference: "ABC123" } }), { status: 200, headers: { "Content-Type": "application/json" } }); });
  const booked = await duffelProvider.execute({ ...base, idempotencyKey: "booking-1" });
  assert.equal(booked.status, "ok");
  assert.equal(key, "booking-1");
});

test("Duffel cancellation returns a quote before the distinct confirmation call", async () => {
  const urls: string[] = [];
  setDuffelFetchForTest(async (url) => { urls.push(String(url)); return new Response(JSON.stringify({ data: urls.length === 1 ? { id: "orc_1", refund_amount: "100.00" } : { id: "orc_1", confirmed_at: "2030-01-01T00:00:00Z" } }), { status: 200, headers: { "Content-Type": "application/json" } }); });
  const base = { userId: "u", agentId: "a", capability: capability("travel.flight.book"), action: "cancel" as const, input: { orderId: "ord_1", approvalRequestId: "approval-1" }, attempt: 1, providerConnection: connection };
  const quoted = await duffelProvider.execute(base);
  assert.equal(quoted.status, "ok");
  assert.equal(urls.length, 1);
  const confirmed = await duffelProvider.execute({ ...base, input: { ...base.input, confirm: true } });
  assert.equal(confirmed.status, "ok");
  assert.equal(urls.length, 3);
  assert.match(urls[2], /actions\/confirm/);
});
