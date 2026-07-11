import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateMarketplaceReadiness } from "./services/creatorListingReadinessService.js";
import type { CapabilityManifest } from "./services/creatorManifestSchema.js";

function manifest(overrides: Partial<CapabilityManifest> = {}): CapabilityManifest {
  return {
    protocol: "MCP",
    sourceType: "native",
    verificationStatus: "declared",
    verificationSummary: [],
    tools: ["vault.search"],
    requestedSchemas: [],
    highRiskActions: [],
    description: "Organizes personal planning details into clear next steps.",
    examplePrompts: ["Help me prepare for my trip"],
    trustReasons: ["Only uses private info after permission and keeps access limited."],
    ...overrides
  };
}

const cleanListing = {
  name: "Travel Paperwork Helper",
  tagline: "Organizes renewal steps before family trips",
  description: "This helper organizes passport, visa, and trip paperwork reminders into simple next steps before travel.",
  capabilityManifest: manifest()
};

test("listing readiness blocks placeholder or test listing content", () => {
  const decision = evaluateMarketplaceReadiness({
    ...cleanListing,
    name: "Demo Helper"
  });

  assert.equal(decision.outcome, "block");
  assert.equal(decision.code, "creator_listing_test_content");
  assert.ok(decision.items.some((item) => item.key === "name" && !item.passed && item.required));
});

test("listing readiness sends vague benefit copy to review", () => {
  const decision = evaluateMarketplaceReadiness({
    ...cleanListing,
    description: "This assistant for anything helps with tasks for everyone."
  });

  assert.equal(decision.outcome, "needs_review");
  assert.equal(decision.code, "creator_listing_too_vague");
  assert.ok(decision.items.some((item) => item.key === "description" && !item.passed && !item.required));
});

test("listing readiness sends generic tagline to review", () => {
  const decision = evaluateMarketplaceReadiness({
    ...cleanListing,
    tagline: "Travel Paperwork Helper"
  });

  assert.equal(decision.outcome, "needs_review");
  assert.equal(decision.code, "creator_listing_too_vague");
  assert.ok(decision.items.some((item) => item.key === "tagline" && !item.passed && !item.required));
});

test("listing readiness sends missing trust language to review", () => {
  const decision = evaluateMarketplaceReadiness({
    ...cleanListing,
    capabilityManifest: manifest({
      trustReasons: ["Designed for careful travel paperwork organization."]
    })
  });

  assert.equal(decision.outcome, "needs_review");
  assert.equal(decision.code, "creator_listing_trust_missing");
  assert.ok(decision.items.some((item) => item.key === "trust" && !item.passed && !item.required));
});

test("listing readiness blocks risky-action helpers without approval copy", () => {
  const decision = evaluateMarketplaceReadiness({
    ...cleanListing,
    tagline: "Books hotels from saved trip preferences",
    description: "This helper books hotels and travel reservations from your saved trip preferences.",
    capabilityManifest: manifest({
      highRiskActions: ["book_non_refundable_travel"],
      trustReasons: ["Uses private info with limited access controls."]
    })
  });

  assert.equal(decision.outcome, "block");
  assert.equal(decision.code, "creator_listing_risky_actions_need_approval_copy");
  assert.ok(decision.items.some((item) => item.key === "risky_actions" && !item.passed && item.required));
});

test("listing readiness publishes a clean native listing", () => {
  const decision = evaluateMarketplaceReadiness(cleanListing);
  assert.equal(decision.outcome, "publish");
  assert.equal(decision.code, "creator_listing_ready");
  assert.ok(decision.items.every((item) => item.passed));
});

test("listing readiness sends external helpers to review", () => {
  const decision = evaluateMarketplaceReadiness({
    ...cleanListing,
    capabilityManifest: manifest({
      protocol: "OpenAPI",
      sourceType: "openapi_endpoint",
      externalEndpointUrl: "https://api.example.com/openapi.json"
    })
  });

  assert.equal(decision.outcome, "needs_review");
  assert.equal(decision.code, "creator_external_agent_needs_review");
  assert.ok(decision.items.some((item) => item.key === "external_review" && !item.passed));
});
