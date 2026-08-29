import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { prisma } from "./db/prisma.js";
import { bookSandboxFlight, cancelSandboxFlight, quoteSandboxCancellation, resetTravelCalendarCreateForTest, searchSandboxFlights, setTravelCalendarCreateForTest, syncSandboxBookingToCalendar } from "./services/travelSandboxService.js";

afterEach(resetTravelCalendarCreateForTest);

test("sandbox travel completes search, explicit booking, quote and cancellation", async () => {
  const userId = `travel-flow-${Date.now()}`;
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" } });
  const offer = searchSandboxFlights({ origin: "ber", destination: "lhr", departureDate: "2030-01-01" })[0];
  await assert.rejects(() => bookSandboxFlight({ userId, offer, passengerNames: ["Test User"], confirmed: false, idempotencyKey: "trip-1" }), /confirmation/i);
  const booking = await bookSandboxFlight({ userId, offer, passengerNames: ["Test User"], confirmed: true, idempotencyKey: "trip-1" });
  const replay = await bookSandboxFlight({ userId, offer, passengerNames: ["Test User"], confirmed: true, idempotencyKey: "trip-1" });
  assert.equal(booking.state, "confirmed");
  assert.equal(replay.id, booking.id);
  const quote = await quoteSandboxCancellation({ userId, transactionId: booking.id });
  assert.equal(quote.refundable, true);
  await assert.rejects(() => cancelSandboxFlight({ userId, transactionId: booking.id, confirmed: false }), /confirmation/i);
  const cancelled = await cancelSandboxFlight({ userId, transactionId: booking.id, confirmed: true });
  assert.equal(cancelled.state, "cancelled");
  await prisma.user.delete({ where: { id: userId } });
});

test("sandbox travel validates route and expired offers", async () => {
  assert.throws(() => searchSandboxFlights({ origin: "BER", destination: "BER", departureDate: "2030-01-01" }), /different/i);
  const userId = `travel-expired-${Date.now()}`;
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" } });
  const offer = { ...searchSandboxFlights({ origin: "BER", destination: "LHR", departureDate: "2030-01-01" })[0], expiresAt: "2020-01-01T00:00:00.000Z" };
  await assert.rejects(() => bookSandboxFlight({ userId, offer, passengerNames: ["Test"], confirmed: true, idempotencyKey: "expired" }), /expired/i);
  await prisma.user.delete({ where: { id: userId } });
});

test("confirmed sandbox itinerary syncs to calendar once and stays user scoped", async () => {
  const userId = `travel-calendar-${Date.now()}`;
  const outsiderId = `${userId}-outsider`;
  await prisma.user.createMany({ data: [userId, outsiderId].map((id) => ({ id, email: `${id}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" })) });
  const offer = searchSandboxFlights({ origin: "BER", destination: "LHR", departureDate: "2030-01-01" })[0];
  const booking = await bookSandboxFlight({ userId, offer, passengerNames: ["Test User"], confirmed: true, idempotencyKey: `calendar-${userId}` });
  let calls = 0;
  setTravelCalendarCreateForTest(async () => { calls += 1; return { status: "ok", eventId: "event-1", eventUrl: "https://calendar.test/event-1", eventStatus: "confirmed" }; });
  const first = await syncSandboxBookingToCalendar({ userId, transactionId: booking.id, timeZone: "Europe/Berlin" });
  const replay = await syncSandboxBookingToCalendar({ userId, transactionId: booking.id, timeZone: "Europe/Berlin" });
  assert.equal((first.calendarEvent as { eventId?: string } | null)?.eventId, "event-1");
  assert.equal(replay.replayed, true);
  assert.equal(calls, 1);
  await assert.rejects(() => syncSandboxBookingToCalendar({ userId: outsiderId, transactionId: booking.id }), /not found/i);
  await prisma.user.deleteMany({ where: { id: { in: [userId, outsiderId] } } });
});
