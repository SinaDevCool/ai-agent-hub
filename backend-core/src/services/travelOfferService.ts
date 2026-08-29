import { z } from "zod";
import { env } from "../config/env.js";
import { badRequest } from "../errors/httpError.js";

export const travelOfferContractVersion = "travel-offer.v1" as const;
export type TravelInventoryMode = "live" | "sandbox";

const amountSchema = z.object({ amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/), currency: z.string().regex(/^[A-Z]{3}$/) });
const hotelPriceSchema = amountSchema.extend({
  base: z.string().regex(/^\d+(?:\.\d{1,2})?$/).optional(),
  taxesIncluded: z.boolean().optional(),
  taxes: z.array(z.object({ amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/), currency: z.string().regex(/^[A-Z]{3}$/), code: z.string().optional(), included: z.boolean().optional() })).default([])
});
const segmentSchema = z.object({ origin: z.string().min(2).max(8), destination: z.string().min(2).max(8), departingAt: z.string().datetime(), arrivingAt: z.string().datetime(), carrier: z.string().max(80).optional(), flightNumber: z.string().max(30).optional() });
export const normalizedFlightOfferSchema = z.object({
  contractVersion: z.literal(travelOfferContractVersion), kind: z.literal("flight"), inventoryMode: z.enum(["live", "sandbox"]), providerId: z.string(), providerOfferId: z.string(), fetchedAt: z.string().datetime(), expiresAt: z.string().datetime(), supplier: z.string(), price: amountSchema, slices: z.array(z.object({ segments: z.array(segmentSchema).min(1) })).min(1), cabinClass: z.string().optional(), baggage: z.array(z.string()).default([]), fareRules: z.array(z.string()).default([]), trace: z.object({ attributable: z.literal(true), providerRequestId: z.string().optional() })
});
export const normalizedHotelOfferSchema = z.object({
  contractVersion: z.literal(travelOfferContractVersion), kind: z.literal("hotel"), inventoryMode: z.enum(["live", "sandbox"]), providerId: z.string(), providerOfferId: z.string(), fetchedAt: z.string().datetime(), expiresAt: z.string().datetime(), supplier: z.string(), property: z.object({ id: z.string(), name: z.string(), cityCode: z.string().optional() }), checkInDate: z.string(), checkOutDate: z.string(), occupancy: z.object({ adults: z.number().int().positive(), rooms: z.number().int().positive() }), price: hotelPriceSchema, room: z.object({ description: z.string().optional(), refundable: z.boolean().optional(), type: z.string().optional(), bedType: z.string().optional(), boardType: z.string().optional(), cancellationDeadline: z.string().datetime().optional(), cancellationDescription: z.string().optional() }), booking: z.object({ hostedCheckoutAvailable: z.boolean(), nativeBookingEnabled: z.boolean(), revalidationRequired: z.boolean() }).optional(), trace: z.object({ attributable: z.literal(true), providerRequestId: z.string().optional(), selectionValidatedAt: z.string().datetime().optional() })
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
  const parsed = z.object({ cityCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), checkInDate: z.string().date(), checkOutDate: z.string().date(), adults: z.coerce.number().int().min(1).max(20).default(1), rooms: z.coerce.number().int().min(1).max(9).default(1), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("EUR"), max: z.coerce.number().int().min(1).max(50).default(20), radius: z.coerce.number().int().min(1).max(300).default(20) }).parse(input);
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

function decimal(value: unknown, multiplier = 1) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("Invalid provider amount");
  return (Math.round(number * multiplier * 100) / 100).toFixed(2);
}

export function normalizeAmadeusHotelOffers(payload: Record<string, unknown>, input: { adults: number; rooms: number; currency: string; max: number }, fetchedAt = new Date(), selectionValidated = false) {
  const rawData = Array.isArray(payload.data) ? payload.data : payload.data && typeof payload.data === "object" ? [payload.data] : [];
  const candidates = rawData.flatMap((rawHotel) => {
    const hotelResult = rawHotel as Record<string, unknown>;
    const hotel = hotelResult.hotel && typeof hotelResult.hotel === "object" ? hotelResult.hotel as Record<string, unknown> : {};
    return (Array.isArray(hotelResult.offers) ? hotelResult.offers : []).map((rawOffer) => ({ hotel, offer: rawOffer as Record<string, unknown> }));
  });
  return validOffers(candidates.slice(0, input.max), (raw) => {
    const { hotel, offer } = raw as { hotel: Record<string, unknown>; offer: Record<string, unknown> };
    const price = offer.price && typeof offer.price === "object" ? offer.price as Record<string, unknown> : {};
    const currency = String(price.currency ?? input.currency).toUpperCase();
    const room = offer.room && typeof offer.room === "object" ? offer.room as Record<string, unknown> : {};
    const typeEstimated = room.typeEstimated && typeof room.typeEstimated === "object" ? room.typeEstimated as Record<string, unknown> : {};
    const description = room.description && typeof room.description === "object" ? room.description as Record<string, unknown> : {};
    const policies = offer.policies && typeof offer.policies === "object" ? offer.policies as Record<string, unknown> : {};
    const cancellations = Array.isArray(policies.cancellations) ? policies.cancellations as Array<Record<string, unknown>> : [];
    const cancellation = cancellations[0];
    const taxes = (Array.isArray(price.taxes) ? price.taxes : []).map((rawTax) => {
      const tax = rawTax as Record<string, unknown>;
      return { amount: decimal(tax.amount), currency, code: String(tax.code ?? "") || undefined, included: tax.included === true };
    });
    const roomQuantity = Number(offer.roomQuantity ?? input.rooms);
    const rooms = Number.isInteger(roomQuantity) && roomQuantity > 0 ? roomQuantity : input.rooms;
    const cancellationDeadline = iso(cancellation?.deadline);
    return normalizedHotelOfferSchema.parse({
      contractVersion: travelOfferContractVersion, kind: "hotel", inventoryMode: "live", providerId: "amadeus", providerOfferId: String(offer.id ?? ""), fetchedAt: fetchedAt.toISOString(), expiresAt: new Date(fetchedAt.getTime() + 10 * 60_000).toISOString(), supplier: "Amadeus",
      property: { id: String(hotel.hotelId ?? ""), name: String(hotel.name ?? ""), cityCode: String(hotel.cityCode ?? "") || undefined }, checkInDate: String(offer.checkInDate ?? ""), checkOutDate: String(offer.checkOutDate ?? ""), occupancy: { adults: input.adults, rooms },
      price: { amount: decimal(price.total, rooms), currency, base: price.base === undefined ? undefined : decimal(price.base, rooms), taxesIncluded: price.variations ? undefined : taxes.every((tax) => tax.included === true), taxes },
      room: { description: String(description.text ?? "") || undefined, refundable: policies.refundable === true, type: String(typeEstimated.category ?? room.type ?? "") || undefined, bedType: String(typeEstimated.bedType ?? "") || undefined, boardType: String(offer.boardType ?? "") || undefined, cancellationDeadline: cancellationDeadline ?? undefined, cancellationDescription: cancellation ? (cancellationDeadline ? `Cancellation deadline: ${cancellationDeadline}` : "Provider cancellation policy applies") : undefined },
      booking: { hostedCheckoutAvailable: false, nativeBookingEnabled: false, revalidationRequired: !selectionValidated }, trace: { attributable: true, providerRequestId: typeof (payload.meta as Record<string, unknown> | undefined)?.requestId === "string" ? String((payload.meta as Record<string, unknown>).requestId) : undefined, selectionValidatedAt: selectionValidated ? fetchedAt.toISOString() : undefined }
    });
  });
}

export function assertHomogeneousTravelInventory(offers: Array<{ inventoryMode: TravelInventoryMode; providerId: string }>) {
  const modes = new Set(offers.map((offer) => offer.inventoryMode));
  if (modes.size > 1) throw badRequest("Live and sandbox travel inventory cannot be combined.", "mixed_travel_inventory");
  return { inventoryMode: offers[0]?.inventoryMode ?? null, providerIds: [...new Set(offers.map((offer) => offer.providerId))] };
}
