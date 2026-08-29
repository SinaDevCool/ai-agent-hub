import assert from "node:assert/strict";
import test from "node:test";
import { env } from "./config/env.js";
import { isVerticalReleaseAllowed } from "./services/featureFlagService.js";

test("vertical release gating is opt-in and fail-closed for live providers", () => {
  const enabled = env.VERTICAL_RELEASE_GATING_ENABLED;
  const rules = env.VERTICAL_RELEASE_RULES;
  try {
    env.VERTICAL_RELEASE_GATING_ENABLED = "false";
    assert.equal(isVerticalReleaseAllowed({ domain: "finance", providerId: "plaid", level: "read" }), true);
    env.VERTICAL_RELEASE_GATING_ENABLED = "true";
    env.VERTICAL_RELEASE_RULES = '{"finance":{"providers":["plaid"],"levels":["read"]}}';
    assert.equal(isVerticalReleaseAllowed({ domain: "finance", providerId: "plaid", level: "read" }), true);
    assert.equal(isVerticalReleaseAllowed({ domain: "finance", providerId: "plaid", level: "transact" }), false);
    assert.equal(isVerticalReleaseAllowed({ domain: "appointments", providerId: "cal-com", level: "read" }), false);
    assert.equal(isVerticalReleaseAllowed({ domain: "finance", providerId: "finance-sandbox", level: "transact" }), true);
  } finally {
    env.VERTICAL_RELEASE_GATING_ENABLED = enabled;
    env.VERTICAL_RELEASE_RULES = rules;
  }
});
