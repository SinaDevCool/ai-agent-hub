import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeWorkflowResult } from "./services/workflowResultNormalizer.js";

const baseInput = {
  workflowConnectionId: "workflow-1",
  workflowName: "Hotel finder",
  capabilityKey: "travel.search_hotels",
  provider: "n8n",
  endpointHost: "workflow.example.test",
  providerStatus: 200
};

test("workflow result quality is complete when travel options include decision fields", () => {
  const result = normalizeWorkflowResult({
    ...baseInput,
    body: {
      summary: "Two hotels found.",
      hotels: [{ name: "Central Stay", location: "Center", price: "$140/night", bookingUrl: "https://example.test/hotel" }]
    }
  });

  assert.equal(result.quality, "complete");
  assert.equal(result.items[0].title, "Central Stay");
});

test("workflow result quality is partial when items miss useful comparison details", () => {
  const result = normalizeWorkflowResult({
    ...baseInput,
    body: {
      summary: "Two hotels found.",
      hotels: [{ name: "Central Stay" }]
    }
  });

  assert.equal(result.quality, "partial");
});

test("workflow result quality is empty when only a summary is returned", () => {
  const result = normalizeWorkflowResult({
    ...baseInput,
    body: { summary: "The search ran but returned no hotels." }
  });

  assert.equal(result.quality, "empty");
  assert.equal(result.items.length, 0);
});

test("workflow result quality is malformed for unusable output", () => {
  const result = normalizeWorkflowResult({
    ...baseInput,
    body: null
  });

  assert.equal(result.quality, "malformed");
  assert.match(result.summary, /did not return/i);
});
