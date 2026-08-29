import { createHash } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { badRequest } from "../errors/httpError.js";
import { decodeJson, encodeJson } from "./jsonService.js";
import { createGoogleCalendarEvent } from "./googleConnectorService.js";
import { createLifeActionPlan, nextLifeActionState, persistLifeActionPlan, serializeLifeTransaction, transitionPersistedLifeTransaction, validateLifeActionPlan } from "./lifeTransactionService.js";

export type SandboxFlightOffer = {
  id: string; carrier: string; origin: string; destination: string; departureDate: string;
  amount: string; currency: string; refundable: boolean; expiresAt: string;
};
export type SandboxHotelOffer = { id: string; propertyName: string; destination: string; checkInDate: string; checkOutDate: string; guests: number; rooms: number; amount: string; currency: string; refundable: boolean; expiresAt: string };
export type SandboxGroundOffer = { id: string; mode: "rail" | "bus" | "transfer"; operator: string; origin: string; destination: string; departureAt: string; arrivalAt: string; amount: string; currency: string; redirectUrl: null };

type CalendarCreate = typeof createGoogleCalendarEvent;
let createCalendarEvent: CalendarCreate = createGoogleCalendarEvent;
export function setTravelCalendarCreateForTest(value: CalendarCreate) { createCalendarEvent = value; }
export function resetTravelCalendarCreateForTest() { createCalendarEvent = createGoogleCalendarEvent; }

function cleanCode(value: unknown, label: string) {
  const code = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw badRequest(`${label} must be a three-letter airport code.`);
  return code;
}

function cleanDate(value: unknown) {
  const date = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw badRequest("Departure date must use YYYY-MM-DD.");
  return date;
}

function requiredText(value: unknown, label: string) { const text = String(value ?? "").trim(); if (!text) throw badRequest(`${label} is required.`); return text; }

export function searchSandboxHotels(input: { destination?: unknown; checkInDate?: unknown; checkOutDate?: unknown; guests?: unknown; rooms?: unknown; currency?: unknown }) {
  const destination = requiredText(input.destination, "Destination"); const checkInDate = cleanDate(input.checkInDate); const checkOutDate = cleanDate(input.checkOutDate); if (checkOutDate <= checkInDate) throw badRequest("Check-out must be after check-in."); const guests = Number(input.guests); const rooms = Number(input.rooms ?? 1); if (!Number.isInteger(guests) || guests < 1 || guests > 20 || !Number.isInteger(rooms) || rooms < 1 || rooms > 10) throw badRequest("Guests or rooms are invalid."); const currency = /^[A-Z]{3}$/.test(String(input.currency ?? "EUR").toUpperCase()) ? String(input.currency ?? "EUR").toUpperCase() : "EUR"; const suffix = createHash("sha256").update(`${destination}|${checkInDate}|${checkOutDate}`).digest("hex").slice(0, 8); const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString(); return [{ id: `hotel-sandbox-flex-${suffix}`, propertyName: "Sandbox Central Hotel", destination, checkInDate, checkOutDate, guests, rooms, amount: "329.00", currency, refundable: true, expiresAt }, { id: `hotel-sandbox-value-${suffix}`, propertyName: "Example City Stay", destination, checkInDate, checkOutDate, guests, rooms, amount: "249.00", currency, refundable: false, expiresAt }] satisfies SandboxHotelOffer[];
}

function cleanHotelOffer(value: unknown): SandboxHotelOffer { if (!value || typeof value !== "object") throw badRequest("A complete sandbox hotel offer is required."); const item = value as Partial<SandboxHotelOffer>; if (!String(item.id ?? "").startsWith("hotel-sandbox-") || Date.parse(String(item.expiresAt)) <= Date.now()) throw badRequest("The sandbox hotel offer is invalid or expired."); return { id: String(item.id), propertyName: requiredText(item.propertyName, "Property"), destination: requiredText(item.destination, "Destination"), checkInDate: cleanDate(item.checkInDate), checkOutDate: cleanDate(item.checkOutDate), guests: Number(item.guests), rooms: Number(item.rooms), amount: requiredText(item.amount, "Amount"), currency: requiredText(item.currency, "Currency"), refundable: item.refundable === true, expiresAt: String(item.expiresAt) }; }

export async function bookSandboxHotel(input: { userId: string; offer: unknown; confirmed: unknown; idempotencyKey: unknown }) { if (input.confirmed !== true) throw badRequest("Explicit hotel booking confirmation is required."); const offer = cleanHotelOffer(input.offer); const key = requiredText(input.idempotencyKey, "Idempotency key"); const values = { offer, selectedOfferId: offer.id, maxApprovedTotal: Number(offer.amount), currency: offer.currency, approvalRequestId: `sandbox-approval:${key}` }; let plan = validateLifeActionPlan(createLifeActionPlan({ capabilityKey: "travel.hotel.book", executionLevel: "transact", providerId: "life-sandbox", idempotencyKey: key, values })); plan = nextLifeActionState(plan); const saved = await persistLifeActionPlan(input.userId, plan); if (saved.state === "confirmed") return serializeLifeTransaction(saved); if (saved.state !== "awaiting_approval") throw badRequest("This hotel booking is already being processed."); await transitionPersistedLifeTransaction({ userId: input.userId, id: saved.id, next: "executing" }); const reference = `HOTEL-${createHash("sha256").update(key).digest("hex").slice(0, 8).toUpperCase()}`; return transitionPersistedLifeTransaction({ userId: input.userId, id: saved.id, next: "confirmed", externalReference: reference, result: { sandbox: true, status: "confirmed", bookingReference: reference, offer } }); }

export function searchSandboxGroundTransport(input: { origin?: unknown; destination?: unknown; departureDate?: unknown; currency?: unknown }) { const origin = requiredText(input.origin, "Origin"); const destination = requiredText(input.destination, "Destination"); if (origin.toLowerCase() === destination.toLowerCase()) throw badRequest("Origin and destination must be different."); const date = cleanDate(input.departureDate); const currency = String(input.currency ?? "EUR").toUpperCase(); const suffix = createHash("sha256").update(`${origin}|${destination}|${date}`).digest("hex").slice(0, 8); return [{ id: `ground-sandbox-rail-${suffix}`, mode: "rail", operator: "Sandbox Rail", origin, destination, departureAt: `${date}T08:00:00Z`, arrivalAt: `${date}T11:30:00Z`, amount: "49.00", currency, redirectUrl: null }, { id: `ground-sandbox-bus-${suffix}`, mode: "bus", operator: "Example Coach", origin, destination, departureAt: `${date}T09:00:00Z`, arrivalAt: `${date}T13:45:00Z`, amount: "29.00", currency, redirectUrl: null }] satisfies SandboxGroundOffer[]; }

export async function getSandboxItinerary(userId: string) { const rows = await prisma.lifeTransaction.findMany({ where: { userId, providerId: "life-sandbox", capabilityKey: { startsWith: "travel." }, state: "confirmed" }, orderBy: { createdAt: "asc" } }); return { sandbox: true, items: rows.map((row) => { const result = decodeJson<Record<string, unknown>>(row.resultJson, {}); return { transactionId: row.id, capabilityKey: row.capabilityKey, reference: row.externalReference, status: row.state, details: result.offer ?? result, calendarEvent: result.calendarEvent ?? null }; }) }; }

export async function cancelSandboxHotel(input: { userId: string; transactionId: string; confirmed: unknown }) { if (input.confirmed !== true) throw badRequest("Explicit hotel cancellation confirmation is required."); const booking = await prisma.lifeTransaction.findFirst({ where: { id: input.transactionId, userId: input.userId, capabilityKey: "travel.hotel.book", providerId: "life-sandbox", state: "confirmed" } }); if (!booking) throw badRequest("A confirmed sandbox hotel booking was not found."); return transitionPersistedLifeTransaction({ userId: input.userId, id: booking.id, next: "cancelled", result: { sandbox: true, status: "cancelled", bookingReference: booking.externalReference } }); }

export function searchSandboxFlights(input: { origin?: unknown; destination?: unknown; departureDate?: unknown; currency?: unknown }) {
  const origin = cleanCode(input.origin, "Origin");
  const destination = cleanCode(input.destination, "Destination");
  if (origin === destination) throw badRequest("Origin and destination must be different.");
  const departureDate = cleanDate(input.departureDate);
  const currency = /^[A-Z]{3}$/.test(String(input.currency ?? "EUR").toUpperCase()) ? String(input.currency ?? "EUR").toUpperCase() : "EUR";
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const route = `${origin}-${destination}-${departureDate}`;
  const suffix = createHash("sha256").update(route).digest("hex").slice(0, 8);
  const offers: SandboxFlightOffer[] = [
    { id: `sandbox-flex-${suffix}`, carrier: "Sandbox Air", origin, destination, departureDate, amount: "249.00", currency, refundable: true, expiresAt },
    { id: `sandbox-light-${suffix}`, carrier: "Example Airways", origin, destination, departureDate, amount: "189.00", currency, refundable: false, expiresAt }
  ];
  return offers;
}

export async function bookSandboxFlight(input: {
  userId: string; offer: SandboxFlightOffer; passengerNames: unknown; confirmed: unknown; idempotencyKey: unknown;
}) {
  if (input.confirmed !== true) throw badRequest("Explicit booking confirmation is required.");
  if (!input.offer || !input.offer.id || !input.offer.amount || !input.offer.currency) throw badRequest("A complete sandbox offer is required.");
  if (!input.offer.id.startsWith("sandbox-")) throw badRequest("Only sandbox offers can be booked through this endpoint.");
  if (Date.parse(input.offer.expiresAt) <= Date.now()) throw badRequest("This sandbox offer expired. Search again before booking.");
  const passengerNames = Array.isArray(input.passengerNames) ? input.passengerNames.map(String).map((item) => item.trim()).filter(Boolean) : [];
  if (!passengerNames.length) throw badRequest("At least one passenger name is required.");
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  if (!idempotencyKey) throw badRequest("An idempotency key is required.");
  let plan = validateLifeActionPlan(createLifeActionPlan({ capabilityKey: "travel.flight.book", executionLevel: "transact", providerId: "life-sandbox", idempotencyKey, values: { offer: input.offer, passengerNames } }));
  plan = nextLifeActionState(plan);
  const saved = await persistLifeActionPlan(input.userId, plan);
  if (saved.state === "confirmed") return serializeLifeTransaction(saved);
  if (saved.state !== "awaiting_approval") throw badRequest("This booking request is already being processed.");
  await transitionPersistedLifeTransaction({ userId: input.userId, id: saved.id, next: "executing" });
  const reference = `SBX${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 7).toUpperCase()}`;
  return transitionPersistedLifeTransaction({ userId: input.userId, id: saved.id, next: "confirmed", externalReference: reference, result: { sandbox: true, bookingReference: reference, status: "confirmed", offer: input.offer, passengerNames } });
}

export async function quoteSandboxCancellation(input: { userId: string; transactionId: string }) {
  const booking = await prisma.lifeTransaction.findFirst({ where: { id: input.transactionId, userId: input.userId, providerId: "life-sandbox", state: "confirmed" } });
  if (!booking) throw badRequest("A confirmed sandbox booking was not found.");
  const result = decodeJson<Record<string, unknown>>(booking.resultJson, {});
  const offer = result.offer as SandboxFlightOffer | undefined;
  return { transactionId: booking.id, bookingReference: booking.externalReference, refundable: offer?.refundable === true, refundAmount: offer?.refundable ? offer.amount : "0.00", currency: offer?.currency ?? "EUR", expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() };
}

export async function cancelSandboxFlight(input: { userId: string; transactionId: string; confirmed: unknown }) {
  if (input.confirmed !== true) throw badRequest("Explicit cancellation confirmation is required.");
  const quote = await quoteSandboxCancellation(input);
  return transitionPersistedLifeTransaction({ userId: input.userId, id: input.transactionId, next: "cancelled", result: { sandbox: true, status: "cancelled", bookingReference: quote.bookingReference, refundStatus: quote.refundable ? "pending" : "not_applicable", refundAmount: quote.refundAmount, currency: quote.currency } });
}

export async function syncSandboxBookingToCalendar(input: { userId: string; transactionId: string; timeZone?: string }) {
  const booking = await prisma.lifeTransaction.findFirst({ where: { id: input.transactionId, userId: input.userId, providerId: "life-sandbox", state: "confirmed" } });
  if (!booking) throw badRequest("A confirmed sandbox booking was not found.");
  const result = decodeJson<Record<string, unknown>>(booking.resultJson, {});
  const offer = result.offer as SandboxFlightOffer | undefined;
  if (!offer?.departureDate) throw badRequest("This booking has no departure date to synchronize.");
  if (result.calendarEvent && typeof result.calendarEvent === "object") return { transaction: serializeLifeTransaction(booking), calendarEvent: result.calendarEvent, replayed: true };
  const start = `${offer.departureDate}T09:00:00Z`;
  const end = `${offer.departureDate}T11:00:00Z`;
  const calendar = await createCalendarEvent({ userId: input.userId, title: `Flight ${offer.origin} to ${offer.destination}`, start, end, timeZone: input.timeZone, location: `${offer.origin} → ${offer.destination}`, description: `Sandbox itinerary only. Booking reference: ${booking.externalReference ?? "unknown"}. Carrier: ${offer.carrier}.` });
  if (calendar.status === "blocked") return { transaction: serializeLifeTransaction(booking), calendarEvent: null, replayed: false, blocked: true, reason: calendar.reason };
  const nextResult = { ...result, calendarEvent: { eventId: calendar.eventId, eventUrl: calendar.eventUrl, eventStatus: calendar.eventStatus } };
  const updated = await prisma.lifeTransaction.update({ where: { id: booking.id }, data: { resultJson: encodeJson(nextResult) } });
  return { transaction: serializeLifeTransaction(updated), calendarEvent: nextResult.calendarEvent, replayed: false };
}
