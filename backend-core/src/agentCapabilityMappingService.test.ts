import assert from "node:assert/strict";
import { test } from "node:test";
import { mapAgentCapabilities } from "./services/agentCapabilityMappingService.js";
import { buildAgentImportManifest } from "./services/agentImportManifestService.js";

function capabilities(input: Parameters<typeof mapAgentCapabilities>[0]) {
  return mapAgentCapabilities(input).mappings.map((mapping) => mapping.canonicalCapability);
}

test("declared capability maps with high confidence", () => {
  const result = mapAgentCapabilities({
    declaredCapabilities: ["travel.search_hotels"]
  });

  assert.equal(result.mappings[0]?.canonicalCapability, "travel.search_hotels");
  assert.equal(result.mappings[0]?.confidence, 0.95);
  assert.equal(result.mappings[0]?.needsReview, false);
});

test("known aliases map to canonical capabilities", () => {
  const result = mapAgentCapabilities({
    declaredCapabilities: ["travel.hotel.search"]
  });

  assert.equal(result.mappings[0]?.canonicalCapability, "travel.search_hotels");
  assert.equal(result.mappings[0]?.confidence, 0.9);
});

test("hotel tool name maps to hotel search", () => {
  assert.ok(capabilities({
    tools: [{ name: "searchStays", description: "Find hotels and lodging by check-in date and guests." }]
  }).includes("travel.search_hotels"));
});

test("flight OpenAPI operation maps to flight search", () => {
  assert.ok(capabilities({
    operations: [{ operationId: "findFlights", path: "/flights/search", method: "get", summary: "Search flights by origin, destination, and departure date" }]
  }).includes("travel.search_flights"));
});

test("car rental text maps to car rental search", () => {
  assert.ok(capabilities({
    name: "Vehicle hire finder",
    description: "Find rental car options and pickup location details."
  }).includes("travel.search_cars"));
});

test("booking and reserve terms map to hold or book travel", () => {
  assert.ok(capabilities({
    tools: [{ name: "bookHotel", description: "Reserve a room and handle non-refundable checkout after approval." }]
  }).includes("travel.hold_or_book"));
});

test("email and Gmail tools map to follow-up drafting", () => {
  assert.ok(capabilities({
    tools: [{ name: "gmailDraftReply", description: "Draft an inbox follow-up email with subject and body." }]
  }).includes("email.follow_up"));
});

test("finance schema maps to spending review", () => {
  assert.ok(capabilities({
    tools: [{
      name: "analyzeRecords",
      inputSchema: {
        properties: {
          transactions: { type: "array" },
          merchant: { type: "string" },
          amount: { type: "number" }
        }
      }
    }]
  }).includes("finance.review_spending"));
});

test("health notes schema maps to health note organization", () => {
  assert.ok(capabilities({
    tools: [{
      name: "summarizeMedicalNotes",
      inputSchema: {
        properties: {
          medicalHistory: { type: "string" },
          medication: { type: "string" },
          diagnosis: { type: "string" }
        }
      }
    }]
  }).includes("health.organize_notes"));
});

test("multi-tool travel agent maps to hotels, flights, and cars", () => {
  const mapped = capabilities({
    tools: [
      { name: "searchHotels", description: "Find stays with check-in and guests." },
      { name: "searchFlights", description: "Find flights by origin and destination airport." },
      { name: "searchRentalCars", description: "Find rental car and vehicle hire options." }
    ]
  });

  assert.ok(mapped.includes("travel.search_hotels"));
  assert.ok(mapped.includes("travel.search_flights"));
  assert.ok(mapped.includes("travel.search_cars"));
});

test("unknown external tool falls back to general research and needs review", () => {
  const result = mapAgentCapabilities({
    tools: [{ name: "doThing", description: "Runs a custom task with no clear domain." }]
  });

  assert.equal(result.mappings[0]?.canonicalCapability, "general.research");
  assert.equal(result.mappings[0]?.confidence, 0.35);
  assert.equal(result.mappings[0]?.needsReview, true);
  assert.ok(result.reviewWarnings.length > 0);
});

test("agent import manifest uses upgraded mapper", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "openapi_endpoint",
    name: "External Travel Agent",
    description: "Searches flights and hotels from messy OpenAPI operations.",
    category: "Travel",
    endpointUrl: "https://api.example.test/openapi.json",
    operations: [
      { operationId: "findFlights", path: "/flights/search", summary: "Find flights by airport route." },
      { operationId: "searchStays", path: "/hotels/search", summary: "Find hotels by check-in date." }
    ]
  });

  const mapped = manifest.capabilities.map((capability) => capability.canonicalCapability);
  assert.ok(mapped.includes("travel.search_flights"));
  assert.ok(mapped.includes("travel.search_hotels"));
});

