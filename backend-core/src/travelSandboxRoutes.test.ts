import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "./app.js";
import { prisma } from "./db/prisma.js";
import { resetTravelCalendarCreateForTest, setTravelCalendarCreateForTest } from "./services/travelSandboxService.js";

const runId = `travel-routes-${Date.now()}`;
const userId = `${runId}-owner`;
const outsiderId = `${runId}-outsider`;
let server: Server;
let baseUrl = "";
async function api(path: string, actingUser: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-user-id": actingUser }, body: JSON.stringify(body ?? {}) });
}

before(async () => {
  await prisma.user.createMany({ data: [userId, outsiderId].map((id) => ({ id, email: `${id}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" })) });
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { resetTravelCalendarCreateForTest(); await new Promise<void>((resolve) => server.close(() => resolve())); await prisma.user.deleteMany({ where: { id: { in: [userId, outsiderId] } } }); });

test("travel HTTP flow searches, books idempotently, syncs calendar, quotes, cancels, and enforces ownership", async () => {
  const search = await api("/api/life-platform/travel/sandbox/search", userId, { origin: "BER", destination: "LHR", departureDate: "2030-01-01" });
  assert.equal(search.status, 200);
  const offer = ((await search.json()) as { offers: unknown[] }).offers[0];
  const bookingBody = { offer, passengerNames: ["Test User"], confirmed: true, idempotencyKey: `${runId}-booking` };
  const booked = await api("/api/life-platform/travel/sandbox/book", userId, bookingBody);
  assert.equal(booked.status, 201);
  const transaction = ((await booked.json()) as { transaction: { id: string; state: string } }).transaction;
  assert.equal(transaction.state, "confirmed");
  const replay = await api("/api/life-platform/travel/sandbox/book", userId, bookingBody);
  assert.equal((((await replay.json()) as { transaction: { id: string } }).transaction.id), transaction.id);

  setTravelCalendarCreateForTest(async () => ({ status: "ok", eventId: "event-route", eventUrl: "https://calendar.test/event-route", eventStatus: "confirmed" }));
  assert.equal((await api(`/api/life-platform/travel/sandbox/${transaction.id}/calendar`, userId)).status, 200);
  assert.equal((await api(`/api/life-platform/travel/sandbox/${transaction.id}/calendar`, outsiderId)).status, 400);
  const quote = await api(`/api/life-platform/travel/sandbox/${transaction.id}/cancellation-quote`, userId);
  assert.equal(quote.status, 200);
  assert.equal((await api(`/api/life-platform/travel/sandbox/${transaction.id}/cancel`, outsiderId, { confirmed: true })).status, 400);
  const cancelled = await api(`/api/life-platform/travel/sandbox/${transaction.id}/cancel`, userId, { confirmed: true });
  assert.equal(cancelled.status, 200);
  assert.equal(((await cancelled.json()) as { transaction: { state: string } }).transaction.state, "cancelled");
});

test("travel HTTP flow searches and books hotels, discovers ground transport, and consolidates itinerary", async () => {
  const hotelSearch = await api("/api/life-platform/travel/sandbox/hotels/search", userId, { destination: "Paris", checkInDate: "2030-06-01", checkOutDate: "2030-06-04", guests: 2, rooms: 1 });
  assert.equal(hotelSearch.status, 200); const hotelOffer = ((await hotelSearch.json()) as { offers: unknown[] }).offers[0];
  const bookingBody = { offer: hotelOffer, confirmed: true, idempotencyKey: `${runId}-hotel` }; const booked = await api("/api/life-platform/travel/sandbox/hotels/book", userId, bookingBody); assert.equal(booked.status, 201); const hotel = ((await booked.json()) as { transaction: { id: string; state: string } }).transaction; assert.equal(hotel.state, "confirmed");
  const replay = await api("/api/life-platform/travel/sandbox/hotels/book", userId, bookingBody); assert.equal(((await replay.json()) as { transaction: { id: string } }).transaction.id, hotel.id);
  const ground = await api("/api/life-platform/travel/sandbox/ground/search", userId, { origin: "Paris", destination: "Lyon", departureDate: "2030-06-04" }); assert.equal(ground.status, 200); assert.equal(((await ground.json()) as { offers: unknown[] }).offers.length, 2);
  const itineraryResponse = await fetch(`${baseUrl}/api/life-platform/travel/sandbox/itinerary`, { headers: { "x-user-id": userId } }); assert.equal(itineraryResponse.status, 200); const itinerary = ((await itineraryResponse.json()) as { itinerary: { items: Array<{ transactionId: string }> } }).itinerary; assert.ok(itinerary.items.some((item) => item.transactionId === hotel.id));
  assert.equal((await api(`/api/life-platform/travel/sandbox/hotels/${hotel.id}/cancel`, outsiderId, { confirmed: true })).status, 400); const cancelled = await api(`/api/life-platform/travel/sandbox/hotels/${hotel.id}/cancel`, userId, { confirmed: true }); assert.equal(((await cancelled.json()) as { transaction: { state: string } }).transaction.state, "cancelled");
});
