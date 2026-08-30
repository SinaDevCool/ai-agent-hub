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

test("normalizes Cal.com date-keyed slot groups into visible result cards", () => {
  const result = normalizeConnectorResult({
    capabilityKey: "appointments.availability.search",
    action: "search",
    providerId: "cal-com",
    providerLabel: "Cal.com",
    toolRunId: "tool-cal-slots",
    rawResult: {
      provider: "cal-com",
      eventType: { id: 42, title: "AI Agent Hub Test", slug: "ai-agent-hub-test" },
      slots: {
        "2026-09-07": [
          { start: "2026-09-07T09:00:00Z", end: "2026-09-07T09:15:00Z" },
          { start: "2026-09-07T10:00:00Z", end: "2026-09-07T10:15:00Z" }
        ]
      }
    }
  });
  assert.equal(result.title, "Appointment slots found");
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.title, "AI Agent Hub Test");
  assert.equal(result.items[0]?.subtitle, "cal-com");
  assert.match(result.items[0]?.detail ?? "", /2026-09-07T09:00:00Z/);
  assert.equal(result.items[0]?.metadata?.providerId, "cal-com");
});
