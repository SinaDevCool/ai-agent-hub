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
      passengers: 1
    }
  );
});

test("incomplete flight prompts do not invent provider fields", () => {
  assert.deepEqual(
    structuredWorkflowInput("travel.search_flights", "Search flights next weekend"),
    { message: "Search flights next weekend" }
  );
});
