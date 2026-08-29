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
