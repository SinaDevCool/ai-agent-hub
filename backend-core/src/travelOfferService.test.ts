import assert from "node:assert/strict";
import test from "node:test";
import {
  assertHomogeneousTravelInventory,
  normalizeAmadeusFlightOffers,
  normalizeDuffelFlightOffers,
  validateFlightSearchInput,
  validateHotelSearchInput
} from "./services/travelOfferService.js";
import { prepareHostedTravelCheckout } from "./services/hostedTravelCheckoutService.js";

test("Duffel offers normalize into attributable versioned live contracts", () => {
  const [offer] = normalizeDuffelFlightOffers({ request_id: "req-duffel", data: { offers: [{
    id: "off_1", total_amount: "199.90", total_currency: "EUR", expires_at: "2030-01-01T01:00:00Z", cabin_class: "economy",
    slices: [{ segments: [{ origin: { iata_code: "BER" }, destination: { iata_code: "LHR" }, departing_at: "2030-01-01T08:00:00Z", arriving_at: "2030-01-01T09:00:00Z", marketing_carrier: { name: "Example Air" }, marketing_carrier_flight_number: "101" }] }]
  }] } }, new Date("2029-12-31T23:00:00Z"));
  assert.equal(offer.contractVersion, "travel-offer.v1");
  assert.equal(offer.inventoryMode, "live");
  assert.equal(offer.providerId, "duffel");
  assert.equal(offer.price.amount, "199.90");
  assert.equal(offer.slices[0].segments[0].origin, "BER");
  assert.equal(offer.trace.providerRequestId, "req-duffel");
});

test("Amadeus normalization drops malformed items but preserves valid partial results", () => {
  const offers = normalizeAmadeusFlightOffers({ data: [
    { id: "bad-offer" },
    { id: "good-offer", price: { grandTotal: "210.00", currency: "EUR" }, itineraries: [{ segments: [{ departure: { iataCode: "BER", at: "2030-01-01T08:00:00Z" }, arrival: { iataCode: "LHR", at: "2030-01-01T09:00:00Z" }, carrierCode: "XX", number: "101" }] }] }
  ] }, new Date("2029-12-31T23:00:00Z"));
  assert.equal(offers.length, 1);
  assert.equal(offers[0].providerOfferId, "good-offer");
  assert.equal(offers[0].supplier, "Amadeus");
});

test("travel searches enforce bounds, dates, launch currencies, and occupancy", () => {
  const flight = validateFlightSearchInput({ origin: "ber", destination: "lhr", departureDate: "2030-01-01", adults: 2, currency: "eur" });
  assert.equal(flight.origin, "BER");
  assert.equal(flight.currency, "EUR");
  assert.throws(() => validateFlightSearchInput({ origin: "BER", destination: "BER", departureDate: "2030-01-01" }), /different/i);
  assert.throws(() => validateFlightSearchInput({ origin: "BER", destination: "LHR", departureDate: "2030-01-01", adults: 10 }), /details|number|less than or equal/i);
  const hotel = validateHotelSearchInput({ cityCode: "ber", checkInDate: "2030-01-01", checkOutDate: "2030-01-03", adults: 2, rooms: 1 });
  assert.equal(hotel.cityCode, "BER");
  assert.throws(() => validateHotelSearchInput({ cityCode: "BER", checkInDate: "2030-01-03", checkOutDate: "2030-01-01" }), /after/i);
});

test("live and sandbox inventory cannot be combined", () => {
  assert.deepEqual(assertHomogeneousTravelInventory([{ inventoryMode: "live", providerId: "duffel" }, { inventoryMode: "live", providerId: "amadeus" }]), { inventoryMode: "live", providerIds: ["duffel", "amadeus"] });
  assert.throws(() => assertHomogeneousTravelInventory([{ inventoryMode: "live", providerId: "duffel" }, { inventoryMode: "sandbox", providerId: "life-sandbox" }]), /cannot be combined/i);
});

test("hosted checkout remains unavailable while its feature gates are disabled", async () => {
  await assert.rejects(() => prepareHostedTravelCheckout({ userId: "user", agentId: "agent", offer: {}, idempotencyKey: "checkout-disabled", acceptedAmount: "10.00", acceptedCurrency: "EUR" }), (error: unknown) => {
    assert.equal((error as { code?: string }).code, "hosted_travel_checkout_disabled");
    return true;
  });
});
