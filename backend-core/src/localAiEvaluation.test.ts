import assert from "node:assert/strict";
import test from "node:test";
import { generateLocalAiEvaluationCases } from "./localAiEvaluationCases.js";
import { interpretWithRules } from "./services/languageModels/rulesLanguageModelProvider.js";

const manifest = { tools: ["appointments.search", "appointments.reserve", "gmail.search", "gmail.send", "vault.search", "payments.execute"] };

test("local AI release suite contains 500 multilingual and adversarial cases", () => {
  const cases = generateLocalAiEvaluationCases();
  assert.equal(cases.length, 500);
  assert.ok(cases.filter((item) => item.locale === "de").length >= 100);
  assert.ok(cases.filter((item) => item.category === "injection").length >= 100);
});

test("rules baseline never turns explicit read-only prompts into writes", () => {
  for (const item of generateLocalAiEvaluationCases().filter((candidate) => candidate.category === "negation")) {
    const result = interpretWithRules({ message: item.prompt, manifest });
    assert.notEqual(result.intent, "action", item.id);
    assert.notEqual(result.proposedTool, "appointments.reserve", item.id);
    assert.notEqual(result.proposedTool, "gmail.send", item.id);
    assert.notEqual(result.proposedTool, "payments.execute", item.id);
  }
});
