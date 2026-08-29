import assert from "node:assert/strict";
import { test } from "node:test";
import { friendlyActionName, getCalendarLookupDays, getEmailDraftInput, getEmailSearchQuery, getRequestedAction, getRuntimeIntent } from "./services/runtimeIntentService.js";

test("runtime intent helper classifies empty, search, and action messages", () => {
  assert.equal(getRuntimeIntent(""), "blocked");
  assert.equal(getRuntimeIntent("   "), "blocked");
  assert.equal(getRuntimeIntent("What trips do I have planned?"), "search");
  assert.equal(getRuntimeIntent("Book a hotel for next Friday"), "action");
  assert.equal(getRuntimeIntent("Find flights using Duffel. Search only—do not book anything."), "search");
  assert.equal(getRuntimeIntent("Show hotel options without booking anything"), "search");
  assert.equal(getRuntimeIntent("Please apply for this card"), "action");
  assert.equal(getRuntimeIntent("Find recent emails about my hotel"), "email_search");
  assert.equal(getRuntimeIntent("Draft an email to sam@example.com saying thanks"), "email_draft");
  assert.equal(getRuntimeIntent("When am I free this week?"), "calendar_free_time");
  assert.equal(getRuntimeIntent("Find available appointment slots for sandbox-clinic from 2030-04-12 to 2030-04-13"), "search");
  assert.equal(getRuntimeIntent("Send this email now"), "action");
});

test("runtime intent helper extracts connector inputs", () => {
  assert.equal(getEmailSearchQuery("Find recent emails about my hotel"), "about hotel");
  assert.deepEqual(getEmailDraftInput("Draft an email to sam@example.com saying thanks for the update"), {
    to: "sam@example.com",
    subject: "Draft from AI Agent Hub",
    body: "thanks for the update"
  });
  assert.equal(getCalendarLookupDays("When am I free today?"), 1);
  assert.equal(getCalendarLookupDays("Find free time in 14 days"), 14);
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
  assert.equal(friendlyActionName("book_non_refundable_travel"), "book non-refundable travel");
});
