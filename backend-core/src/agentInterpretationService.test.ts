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

test("rules interpreter preserves a portable normalized task for every domain", async () => {
  const prompts = [
    "Plan a weekend trip using my preferences",
    "Find the spending rule I should follow",
    "Make a home maintenance checklist",
    "Explain yesterday's energy use"
  ];
  for (const message of prompts) {
    const result = await interpretAgentMessage({
      message,
      manifest: { tools: ["vault.search", "workflow.run", "action.execute"], requestedSchemas: [], highRiskActions: [] }
    });
    assert.equal(result.arguments.task, message);
    if (result.proposedTool) assert.ok(["vault.search", "workflow.run", "action.execute"].includes(result.proposedTool));
  }
});

test("rules interpreter maps connected-account domains to exact declared tools", async () => {
  const cases = [
    ["Search my inbox for the invoice", "email_search", "email.search", "query"],
    ["Draft an email to Alex saying thank you", "email_draft", "email.draft_reply", "body"],
    ["When am I free in the next 3 days?", "calendar_free_time", "calendar.find_free_time", "days"],
    ["Find the proposal document in Drive", "document_search", "drive.search", "query"]
  ] as const;
  const tools = ["vault.search", "email.search", "email.draft_reply", "calendar.find_free_time", "drive.search"];
  for (const [message, intent, proposedTool, argument] of cases) {
    const result = await interpretAgentMessage({ message, manifest: { tools, requestedSchemas: [], highRiskActions: [] } });
    assert.equal(result.intent, intent);
    assert.equal(result.proposedTool, proposedTool);
    assert.ok(result.arguments[argument]);
  }
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
