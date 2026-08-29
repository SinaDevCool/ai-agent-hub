import assert from "node:assert/strict";
import test from "node:test";
import { env } from "./config/env.js";
import { getHouseholdProviderDestination, searchLiveHouseholdProviders } from "./services/googlePlacesHouseholdProvider.js";

test("Google Places household discovery uses a bounded field mask and normalizes transient results", async () => {
  const originalFlag = env.LIVE_HOUSEHOLD_ENABLED; const originalKey = env.GOOGLE_PLACES_API_KEY; const originalFetch = globalThis.fetch;
  env.LIVE_HOUSEHOLD_ENABLED = "true"; env.GOOGLE_PLACES_API_KEY = "test-google-places-key";
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (url, init) => { requests.push({ url: String(url), init }); return new Response(JSON.stringify({ places: [{ id: "ChIJ0123456789", displayName: { text: "Example Plumbing" }, formattedAddress: "1 Main Street", rating: 4.7, userRatingCount: 42, businessStatus: "OPERATIONAL", websiteUri: "https://plumber.example", googleMapsUri: "https://maps.google.com/?cid=1" }, { id: "ChIJCLOSED123", displayName: { text: "Closed" }, formattedAddress: "2 Main Street", businessStatus: "CLOSED_PERMANENTLY" }] }), { status: 200, headers: { "content-type": "application/json" } }); };
  try {
    const result = await searchLiveHouseholdProviders({ serviceType: "Plumber", location: "Berlin" });
    assert.equal(result.providers.length, 1); assert.equal(result.providers[0]?.placeId, "ChIJ0123456789"); assert.equal(result.providers[0]?.websiteAvailable, true); assert.equal(result.attribution.googleLogoRequired, true);
    assert.equal(requests[0]?.url, "https://places.googleapis.com/v1/places:searchText"); assert.match(String((requests[0]?.init?.headers as Record<string, string>)["X-Goog-FieldMask"]), /places\.id/); assert.doesNotMatch(JSON.stringify(result), /plumber\.example/);
  } finally { globalThis.fetch = originalFetch; env.LIVE_HOUSEHOLD_ENABLED = originalFlag; env.GOOGLE_PLACES_API_KEY = originalKey; }
});

test("household destination is refreshed by Place ID and unsafe websites fail closed", async () => {
  const originalFlag = env.LIVE_HOUSEHOLD_ENABLED; const originalKey = env.GOOGLE_PLACES_API_KEY; const originalFetch = globalThis.fetch; env.LIVE_HOUSEHOLD_ENABLED = "true"; env.GOOGLE_PLACES_API_KEY = "test-google-places-key";
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ id: "ChIJ0123456789", businessStatus: "OPERATIONAL", websiteUri: "https://provider.example/book" }), { status: 200 });
    assert.equal(await getHouseholdProviderDestination("ChIJ0123456789"), "https://provider.example/book");
    globalThis.fetch = async () => new Response(JSON.stringify({ id: "ChIJ0123456789", businessStatus: "OPERATIONAL", websiteUri: "http://localhost/admin" }), { status: 200 });
    await assert.rejects(() => getHouseholdProviderDestination("ChIJ0123456789"), (error: unknown) => (error as { code?: string }).code === "unsafe_household_destination");
  } finally { globalThis.fetch = originalFetch; env.LIVE_HOUSEHOLD_ENABLED = originalFlag; env.GOOGLE_PLACES_API_KEY = originalKey; }
});
