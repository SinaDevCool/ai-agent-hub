import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { getConnectorCapability } from "./services/connectorCapabilityService.js";
import { amadeusProvider, resetAmadeusFetchForTest, setAmadeusFetchForTest } from "./services/providers/amadeusProvider.js";

afterEach(resetAmadeusFetchForTest);
function capability(key: string) { const value = getConnectorCapability(key); assert.ok(value); return value; }
const providerConnection = { id: "c", status: "active", displayName: "Amadeus", credentials: { clientId: "id", clientSecret: "secret", baseUrl: "https://test.api.amadeus.com" } };

test("Amadeus authenticates and searches flight offers", async () => {
  const urls: string[] = [];
  setAmadeusFetchForTest(async (url) => { urls.push(String(url)); return urls.length === 1 ? new Response(JSON.stringify({ access_token: "token" }), { status: 200, headers: { "Content-Type": "application/json" } }) : new Response(JSON.stringify({ data: [{ id: "offer-1" }] }), { status: 200, headers: { "Content-Type": "application/json" } }); });
  const result = await amadeusProvider.execute({ userId: "u", agentId: "a", capability: capability("travel.flight.search"), action: "search", input: { origin: "BER", destination: "LHR", departureDate: "2030-01-01" }, attempt: 1, providerConnection });
  assert.equal(result.status, "ok");
  assert.match(urls[0], /oauth2\/token/);
  assert.match(urls[1], /flight-offers/);
  assert.match(urls[1], /originLocationCode=BER/);
});

test("Amadeus refuses use without credentials", async () => {
  const result = await amadeusProvider.execute({ userId: "u", agentId: "a", capability: capability("travel.hotel.search"), action: "search", input: { cityCode: "BER" }, attempt: 1 });
  assert.equal(result.status, "blocked");
  if (result.status === "blocked") assert.equal(result.code, "connector_not_connected");
});

test("Amadeus discovers hotel ids then returns normalized live room offers", async () => {
  const urls: string[] = [];
  setAmadeusFetchForTest(async (url) => {
    urls.push(String(url));
    if (urls.length === 1) return new Response(JSON.stringify({ access_token: "token" }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (urls.length === 2) return new Response(JSON.stringify({ data: [{ hotelId: "HLPAR266" }, { hotelId: "ACPAR123" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (urls.length === 3) return new Response(JSON.stringify({ access_token: "token" }), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ meta: { requestId: "req-hotel" }, data: [{ hotel: { hotelId: "HLPAR266", name: "Hilton Paris Opera", cityCode: "PAR" }, offers: [{ id: "OFFER123", checkInDate: "2030-06-01", checkOutDate: "2030-06-03", roomQuantity: "2", boardType: "BREAKFAST", room: { description: { text: "Queen room" }, typeEstimated: { category: "STANDARD_ROOM", bedType: "QUEEN" } }, price: { currency: "EUR", base: "100.00", total: "120.50", taxes: [{ amount: "20.50", code: "TOTAL_TAX", included: true }] }, policies: { refundable: true, cancellations: [{ deadline: "2030-05-30T18:00:00Z" }] } }, { id: "", price: {} }] }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const result = await amadeusProvider.execute({ userId: "u", agentId: "a", capability: capability("travel.hotel.search"), action: "search", input: { cityCode: "PAR", checkInDate: "2030-06-01", checkOutDate: "2030-06-03", adults: 2, rooms: 2, currency: "EUR" }, attempt: 1, providerConnection });
  assert.equal(result.status, "ok");
  assert.match(urls[1], /hotels\/by-city/);
  assert.match(urls[1], /hotelSource=ALL/);
  assert.match(urls[3], /v3\/shopping\/hotel-offers/);
  assert.match(urls[3], /hotelIds=HLPAR266%2CACPAR123/);
  if (result.status === "ok") {
    const offers = result.result?.offers as Array<Record<string, any>>;
    assert.equal(offers.length, 1);
    assert.equal(offers[0].price.amount, "241.00");
    assert.equal(offers[0].room.boardType, "BREAKFAST");
    assert.equal(offers[0].room.cancellationDeadline, "2030-05-30T18:00:00.000Z");
    assert.deepEqual(offers[0].booking, { hostedCheckoutAvailable: false, nativeBookingEnabled: false, revalidationRequired: true });
  }
});

test("Amadeus revalidates one selected hotel offer without native booking", async () => {
  const urls: string[] = [];
  setAmadeusFetchForTest(async (url) => {
    urls.push(String(url));
    if (urls.length === 1) return new Response(JSON.stringify({ access_token: "token" }), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ data: { hotel: { hotelId: "HLPAR266", name: "Hilton Paris Opera", cityCode: "PAR" }, offers: [{ id: "OFFER123", checkInDate: "2030-06-01", checkOutDate: "2030-06-03", roomQuantity: "1", room: { description: { text: "Queen room" } }, price: { currency: "EUR", total: "120.50" }, policies: { refundable: false } }] } }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const result = await amadeusProvider.execute({ userId: "u", agentId: "a", capability: capability("travel.hotel.search"), action: "search", input: { offerId: "OFFER123", adults: 1, rooms: 1, currency: "EUR" }, attempt: 1, providerConnection });
  assert.equal(result.status, "ok");
  assert.match(urls[1], /hotel-offers\/OFFER123$/);
  if (result.status === "ok") {
    assert.equal(result.result?.selectedOfferRevalidated, true);
    const offer = (result.result?.offers as Array<Record<string, any>>)[0];
    assert.equal(offer.trace.selectionValidatedAt.length > 0, true);
    assert.equal(offer.booking.revalidationRequired, false);
  }
});
