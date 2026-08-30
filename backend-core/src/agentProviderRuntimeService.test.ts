import assert from "node:assert/strict";
import test from "node:test";
import {
  preferredProviderFromMessage,
  structuredWorkflowInput
} from "./services/agentProviderRuntimeService.js";

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

test("appointment provider prompts include specialty and location", () => {
  assert.deepEqual(
    structuredWorkflowInput("appointments.provider.search", "Find a dentist in Berlin"),
    {
      message: "Find a dentist in Berlin",
      specialty: "dentist",
      location: "Berlin"
    }
  );
});

test("appointment availability prompts include provider and date range", () => {
  assert.deepEqual(
    structuredWorkflowInput(
      "appointments.availability.search",
      "Find available appointment slots for sandbox-clinic from 2030-04-12 to 2030-04-13"
    ),
    {
      message: "Find available appointment slots for sandbox-clinic from 2030-04-12 to 2030-04-13",
      providerId: "sandbox-clinic",
      startDate: "2030-04-12",
      endDate: "2030-04-13"
    }
  );
});

test("appointment sandbox prompts select the built-in life sandbox provider", () => {
  assert.equal(
    preferredProviderFromMessage(
      "Find available appointment slots for sandbox-clinic from 2030-04-12 to 2030-04-13"
    ),
    "life-sandbox"
  );
});

test("Cal.com availability prompts select the live provider and parse a named date range", () => {
  const message = "Using Cal.com, find my available appointment slots from September 7, 2026 to September 11, 2026.";
  assert.equal(preferredProviderFromMessage(message), "cal-com");
  assert.deepEqual(structuredWorkflowInput("appointments.availability.search", message), {
    message,
    providerId: "cal-com",
    startDate: "2026-09-07",
    endDate: "2026-09-11",
    start: "2026-09-07",
    end: "2026-09-11"
  });
});

test("appointment management prompts identify operation and provider without inventing approval", () => {
  assert.deepEqual(
    structuredWorkflowInput("appointments.booking.manage", "Cancel appointment with sandbox-clinic"),
    {
      message: "Cancel appointment with sandbox-clinic",
      operation: "cancel",
      providerId: "sandbox-clinic"
    }
  );
});

test("appointment booking prompts keep the selected provider and slot", () => {
  assert.deepEqual(
    structuredWorkflowInput(
      "appointments.booking.manage",
      "Book the sandbox-clinic appointment slot sandbox-slot-morning"
    ),
    {
      message: "Book the sandbox-clinic appointment slot sandbox-slot-morning",
      operation: "book",
      providerId: "sandbox-clinic",
      slotId: "sandbox-slot-morning"
    }
  );
});
