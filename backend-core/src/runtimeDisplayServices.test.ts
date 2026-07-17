import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRuntimeActivityDisplay } from "./services/runtimeActivityDisplayService.js";
import { buildRuntimeChatDisplay, buildRuntimeUserChatDisplay } from "./services/runtimeChatDisplayService.js";
import type { RuntimeAgent, RuntimeResult } from "./services/agentRuntimeTypes.js";

const agent: RuntimeAgent = {
  id: "agent-1",
  name: "Travel Agent",
  capabilityManifest: "{}"
};

test("runtime chat display turns approval waits into plain user language", () => {
  const result: RuntimeResult = {
    status: "awaiting_human_approval",
    intent: "action",
    reply: "Travel Agent paused before book_non_refundable_travel.",
    runtimeState: "needs_approval",
    actionName: "book_non_refundable_travel",
    requestId: "hitl-1"
  };

  const display = buildRuntimeChatDisplay({ agent, result });

  assert.equal(display.title, "Waiting for your approval");
  assert.equal(display.badge, "Waiting for you");
  assert.equal(display.category, "approval");
  assert.match(display.body, /book non-refundable travel/i);
  assert.doesNotMatch(JSON.stringify(display), /book_non_refundable_travel|provider_error|internal server error/i);
});

test("runtime chat display hides raw provider errors behind B2C copy", () => {
  const result: RuntimeResult = {
    status: "blocked",
    intent: "action",
    reply: "provider_error: workflow failed with internal server error",
    reason: "provider_error",
    runtimeState: "blocked",
    nextStep: "provider_error"
  };

  const display = buildRuntimeChatDisplay({ agent, result });

  assert.equal(display.badge, "Blocked");
  assert.equal(display.body, "The agent could not finish that request. Please try again in a moment.");
  assert.equal(display.nextStep, "Try again in a moment.");
  assert.doesNotMatch(JSON.stringify(display), /provider_error|internal server error|workflow failed/i);
});

test("runtime user continuation display hides raw action tokens", () => {
  const display = buildRuntimeUserChatDisplay("Continue the approved action: book_non_refundable_travel");

  assert.equal(display?.title, "Continue approved action");
  assert.equal(display?.body, "Continue approved action: book non-refundable travel");
  assert.doesNotMatch(JSON.stringify(display), /book_non_refundable_travel/);
});

test("runtime activity display keeps approval decisions consistent", () => {
  const waiting = buildRuntimeActivityDisplay({
    actionType: "hitl_requested",
    status: "pending_human_approval",
    dataAccessed: "book_non_refundable_travel",
    metadata: { actionName: "book_non_refundable_travel" },
    agentName: "Travel Agent"
  });
  const denied = buildRuntimeActivityDisplay({
    actionType: "hitl_denied",
    status: "blocked_by_policy",
    dataAccessed: "book_non_refundable_travel",
    metadata: { actionName: "book_non_refundable_travel" },
    agentName: "Travel Agent"
  });

  assert.equal(waiting.badge, "Waiting for you");
  assert.equal(waiting.approvalStatus, "waiting");
  assert.match(waiting.title, /book non-refundable travel/i);
  assert.equal(denied.title, "You denied this action");
  assert.equal(denied.badge, "Blocked");
  assert.equal(denied.approvalStatus, "denied");
  assert.match(denied.summary, /will not continue/i);
  assert.doesNotMatch(JSON.stringify({ waiting, denied }), /book_non_refundable_travel|provider_error|internal server error/i);
});
