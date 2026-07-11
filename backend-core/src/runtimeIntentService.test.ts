import assert from "node:assert/strict";
import { test } from "node:test";
import { friendlyActionName, getRequestedAction, getRuntimeIntent } from "./services/runtimeIntentService.js";

test("runtime intent helper classifies empty, search, and action messages", () => {
  assert.equal(getRuntimeIntent(""), "blocked");
  assert.equal(getRuntimeIntent("   "), "blocked");
  assert.equal(getRuntimeIntent("What trips do I have planned?"), "search");
  assert.equal(getRuntimeIntent("Book a hotel for next Friday"), "action");
  assert.equal(getRuntimeIntent("Please apply for this card"), "action");
});

test("runtime action helper keeps the shared high-risk fallback order", () => {
  assert.equal(getRequestedAction("Please pay the invoice", []), "transfer_funds");
  assert.equal(getRequestedAction("Reserve a flight", []), "book_non_refundable_travel");
  assert.equal(getRequestedAction("Open a credit card", []), "open_credit_card");
  assert.equal(getRequestedAction("Share my doctor record", []), "share_medical_record");
  assert.equal(getRequestedAction("Sign this contract", []), "sign_contract");
  assert.equal(getRequestedAction("Do the sensitive thing", ["custom_high_risk"]), "custom_high_risk");
});

test("runtime action helper prefers explicitly declared action names", () => {
  assert.equal(
    getRequestedAction("Please handle book non refundable travel now", ["book_non_refundable_travel"]),
    "book_non_refundable_travel"
  );
  assert.equal(friendlyActionName("book_non_refundable_travel"), "book non refundable travel");
});
