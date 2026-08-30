import assert from "node:assert/strict";
import { test } from "node:test";
import { interpretationResultSchema } from "./services/agentInterpretationSchema.js";
import { interpretAgentMessage, validateInterpretationForManifest } from "./services/agentInterpretationService.js";

test("rules interpreter produces a constrained search plan", async () => {
  const result = await interpretAgentMessage({
    message: "Find flights, search only and do not book anything",
    manifest: { tools: ["travel.search", "action.execute"] }
  });
  assert.equal(result.intent, "search");
  assert.equal(result.proposedTool, "travel.search");
  assert.equal(result.language, "en");
  assert.equal(interpretationResultSchema.safeParse(result).success, true);
});

test("manifest validation rejects undeclared model-selected tools", () => {
  const result = validateInterpretationForManifest({
    manifest: { tools: ["vault.search"] },
    interpretation: {
      intent: "action",
      proposedTool: "payments.transfer",
      arguments: { amount: 1000 },
      missingFields: [],
      requiresClarification: false,
      confidence: 0.99,
      language: "en",
      riskHints: []
    }
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /not declared/i);
});

test("manifest validation blocks incomplete writes", () => {
  const result = validateInterpretationForManifest({
    manifest: { tools: ["action.execute"] },
    interpretation: {
      intent: "action",
      proposedTool: "action.execute",
      arguments: {},
      missingFields: ["amount"],
      requiresClarification: true,
      confidence: 0.5,
      language: "en",
      riskHints: ["write_action"]
    }
  });
  assert.equal(result.ok, false);
});

test("interpretation schema rejects extra fields", () => {
  const parsed = interpretationResultSchema.safeParse({
    intent: "search",
    proposedTool: null,
    arguments: {},
    missingFields: [],
    requiresClarification: false,
    confidence: 1,
    language: "en",
    riskHints: [],
    approved: true
  });
  assert.equal(parsed.success, false);
});

