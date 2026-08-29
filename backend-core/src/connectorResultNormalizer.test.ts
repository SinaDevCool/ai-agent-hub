import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConnectorResult } from "./services/connectorResultNormalizer.js";

test("normalizes appointment sandbox slots into visible result cards", () => {
  const result = normalizeConnectorResult({
    capabilityKey: "appointments.availability.search",
    action: "search",
    providerId: "life-sandbox",
    providerLabel: "Life Services Sandbox",
    toolRunId: "appointment-search-1",
    rawResult: {
      slots: [{
        id: "sandbox-slot-morning",
        providerId: "sandbox-clinic",
        startsAt: "2030-04-12T09:00:00Z"
      }]
    }
  });

  assert.equal(result.title, "Appointment slots found");
  assert.equal(result.summary, "I found 1 option.");
  assert.deepEqual(result.items, [{
    title: "Appointment slot 1",
    subtitle: "sandbox-clinic",
    detail: "2030-04-12T09:00:00Z",
    metadata: {
      slotId: "sandbox-slot-morning",
      providerId: "sandbox-clinic"
    }
  }]);
});
