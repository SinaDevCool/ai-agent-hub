import { z } from "zod";
import { env } from "../config/env.js";
import { badRequest } from "../errors/httpError.js";

export const travelOfferContractVersion = "travel-offer.v1" as const;
export type TravelInventoryMode = "live" | "sandbox";

const amountSchema = z.object({ amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/), currency: z.string().regex(/^[A-Z]{3}$/) });
const segmentSchema = z.object({ origin: z.string().min(2).max(8), destination: z.string().min(2).max(8), departingAt: z.string().datetime(), arrivingAt: z.string().datetime(), carrier: z.string().max(80).optional(), flightNumber: z.string().max(30).optional() });
export const normalizedFlightOfferSchema = z.object({
  contractVersion: z.literal(travelOfferContractVersion), kind: z.literal("flight"), inventoryMode: z.enum(["live", "sandbox"]), providerId: z.string(), providerOfferId: z.string(), fetchedAt: z.string().datetime(), expiresAt: z.string().datetime(), supplier: z.string(), price: amountSchema, slices: z.array(z.object({ segments: z.array(segmentSchema).min(1) })).min(1), cabinClass: z.string().optional(), baggage: z.array(z.string()).default([]), fareRules: z.array(z.string()).default([]), trace: z.object({ attributable: z.literal(true), providerRequestId: z.string().optional() })
});
export const normalizedHotelOfferSchema = z.object({
  contractVersion: z.literal(travelOfferContractVersion), kind: z.literal("hotel"), inventoryMode: z.enum(["live", "sandbox"]), providerId: z.string(), providerOfferId: z.string(), fetchedAt: z.string().datetime(), expiresAt: z.string().datetime(), supplier: z.string(), property: z.object({ id: z.string(), name: z.string(), cityCode: z.string().optional() }), checkInDate: z.string(), checkOutDate: z.string(), occupancy: z.object({ adults: z.number().int().positive(), rooms: z.number().int().positive() }), price: amountSchema, room: z.object({ description: z.string().optional(), refundable: z.boolean().optional() }), trace: z.object({ attributable: z.literal(true), providerRequestId: z.string().optional() })
});
export type NormalizedFlightOffer = z.infer<typeof normalizedFlightOfferSchema>;
export type NormalizedHotelOffer = z.infer<typeof normalizedHotelOfferSchema>;

const launchCurrencies = new Set(env.TRAVEL_LAUNCH_CURRENCIES.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean));

export function validateFlightSearchInput(input: Record<string, unknown>) {
  const schema = z.object({ origin: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), destination: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), departureDate: z.string().date(), returnDate: z.string().date().optional(), adults: z.coerce.number().int().min(1).max(9).default(1), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("EUR"), max: z.coerce.number().int().min(1).max(50).default(20), cabinClass: z.enum(["economy", "premium_economy", "business", "first"]).default("economy") });
  const parsed = schema.parse(input);
  if (parsed.origin === parsed.destination) throw badRequest("Origin and destination must be different.");
  if (Date.parse(`${parsed.departureDate}T23:59:59Z`) < Date.now()) throw badRequest("Departure date must not be in the past.");
  if (parsed.returnDate && parsed.returnDate < parsed.departureDate) throw badRequest("Return date must not be before departure.");
  if (!launchCurrencies.has(parsed.currency)) throw badRequest(`Currency ${parsed.currency} is outside the configured travel launch market.`);
  return parsed;
}

export function validateHotelSearchInput(input: Record<string, unknown>) {
  const parsed = z.object({ cityCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), checkInDate: z.string().date(), checkOutDate: z.string().date(), adults: z.coerce.number().int().min(1).max(20).default(1), rooms: z.coerce.number().int().min(1).max(10).default(1), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("EUR"), max: z.coerce.number().int().min(1).max(50).default(20) }).parse(input);
  if (parsed.checkOutDate <= parsed.checkInDate) throw badRequest("Check-out must be after check-in.");
  if (!launchCurrencies.has(parsed.currency)) throw badRequest(`Currency ${parsed.currency} is outside the configured travel launch market.`);
  return parsed;
}

function iso(value: unknown) { const date = new Date(String(value ?? "")); return Number.isFinite(date.getTime()) ? date.toISOString() : null; }
function money(value: unknown, fallbackCurrency = "EUR") {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const amount = String(item.total_amount ?? item.total ?? item.grandTotal ?? item.amount ?? "");
  const currency = String(item.total_currency ?? item.currency ?? fallbackCurrency).toUpperCase();
  return amountSchema.parse({ amount, currency });
}
function validOffers<T>(offers: unknown[], normalize: (raw: unknown) => T) {
  const valid: T[] = [];
  for (const raw of offers) {
    try { valid.push(normalize(raw)); } catch { /* A malformed provider item must not discard otherwise valid offers. */ }
  }
  return valid;
}

export function normalizeDuffelFlightOffers(payload: Record<string, unknown>, fetchedAt = new Date()) {
  const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
  const offers = Array.isArray(data.offers) ? data.offers : [];
  return validOffers(offers, (raw) => {
    const offer = raw as Record<string, unknown>;
    const slices = (Array.isArray(offer.slices) ? offer.slices : []).map((rawSlice) => ({ segments: (Array.isArray((rawSlice as Record<string, unknown>).segments) ? (rawSlice as Record<string, unknown>).segments as unknown[] : []).map((rawSegment) => {
      const segment = rawSegment as Record<string, unknown>; const origin = segment.origin as Record<string, unknown> | undefined; const destination = segment.destination as Record<string, unknown> | undefined; const carrier = segment.marketing_carrier as Record<string, unknown> | undefined;
      return { origin: String(origin?.iata_code ?? ""), destination: String(destination?.iata_code ?? ""), departingAt: iso(segment.departing_at), arrivingAt: iso(segment.arriving_at), carrier: String(carrier?.name ?? carrier?.iata_code ?? ""), flightNumber: String(segment.marketing_carrier_flight_number ?? "") };
    }) }));
    const expiresAt = iso(offer.expires_at) ?? new Date(fetchedAt.getTime() + 15 * 60_000).toISOString();
    return normalizedFlightOfferSchema.parse({ contractVersion: travelOfferContractVersion, kind: "flight", inventoryMode: "live", providerId: "duffel", providerOfferId: String(offer.id ?? ""), fetchedAt: fetchedAt.toISOString(), expiresAt, supplier: "Duffel", price: money(offer), slices, cabinClass: String(offer.cabin_class ?? "") || undefined, baggage: [], fareRules: [offer.conditions ? "Provider fare conditions available" : "Fare rules require revalidation"], trace: { attributable: true, providerRequestId: typeof payload.request_id === "string" ? payload.request_id : undefined } });
  });
}

export function normalizeAmadeusFlightOffers(payload: Record<string, unknown>, fetchedAt = new Date()) {
  const offers = Array.isArray(payload.data) ? payload.data : [];
  return validOffers(offers, (raw) => {
    const offer = raw as Record<string, unknown>;
    const itineraries = Array.isArray(offer.itineraries) ? offer.itineraries : [];
    const slices = itineraries.map((rawItinerary) => ({ segments: (Array.isArray((rawItinerary as Record<string, unknown>).segments) ? (rawItinerary as Record<string, unknown>).segments as unknown[] : []).map((rawSegment) => {
      const segment = rawSegment as Record<string, unknown>; const departure = segment.departure as Record<string, unknown> | undefined; const arrival = segment.arrival as Record<string, unknown> | undefined;
      return { origin: String(departure?.iataCode ?? ""), destination: String(arrival?.iataCode ?? ""), departingAt: iso(departure?.at), arrivingAt: iso(arrival?.at), carrier: String(segment.carrierCode ?? ""), flightNumber: String(segment.number ?? "") };
    }) }));
    return normalizedFlightOfferSchema.parse({ contractVersion: travelOfferContractVersion, kind: "flight", inventoryMode: "live", providerId: "amadeus", providerOfferId: String(offer.id ?? ""), fetchedAt: fetchedAt.toISOString(), expiresAt: new Date(fetchedAt.getTime() + 10 * 60_000).toISOString(), supplier: "Amadeus", price: money(offer.price), slices, baggage: [], fareRules: [offer.oneWay === true ? "One-way offer" : "Provider fare rules require revalidation"], trace: { attributable: true, providerRequestId: typeof (payload.meta as Record<string, unknown> | undefined)?.requestId === "string" ? String((payload.meta as Record<string, unknown>).requestId) : undefined } });
  });
}

export function assertHomogeneousTravelInventory(offers: Array<{ inventoryMode: TravelInventoryMode; providerId: string }>) {
  const modes = new Set(offers.map((offer) => offer.inventoryMode));
  if (modes.size > 1) throw badRequest("Live and sandbox travel inventory cannot be combined.", "mixed_travel_inventory");
  return { inventoryMode: offers[0]?.inventoryMode ?? null, providerIds: [...new Set(offers.map((offer) => offer.providerId))] };
}
