import assert from "node:assert/strict";
import test from "node:test";
import { structuredWorkflowInput } from "./services/agentProviderRuntimeService.js";

test("flight search prompts provide the structured provider fields", () => {
  assert.deepEqual(
    structuredWorkflowInput(
      "travel.search_flights",
      "Search flights from Berlin to Paris departing 2026-09-05 for 1 passenger"
    ),
    {
      message: "Search flights from Berlin to Paris departing 2026-09-05 for 1 passenger",
      origin: "Berlin",
      destination: "Paris",
      departureDate: "2026-09-05",
      passengers: 1,
      adults: 1
    }
  );
});

test("flight search prompts parse named dates, cabin, and result limits", () => {
  assert.deepEqual(
    structuredWorkflowInput(
      "travel.search_flights",
      "Using Duffel, find 5 one-way economy flights from BER to LHR on September 19, 2026, for 1 adult."
    ),
    {
      message: "Using Duffel, find 5 one-way economy flights from BER to LHR on September 19, 2026, for 1 adult.",
      origin: "BER",
      destination: "LHR",
      departureDate: "2026-09-19",
      passengers: 1,
      adults: 1,
      max: 5,
      cabin: "economy",
      cabinClass: "economy"
    }
  );
});

test("incomplete flight prompts do not invent provider fields", () => {
  assert.deepEqual(
    structuredWorkflowInput("travel.search_flights", "Search flights next weekend"),
    { message: "Search flights next weekend" }
  );
});
