import assert from "node:assert/strict";
import test from "node:test";
import {
  isDemoAgentName,
  isDemoDocumentTitle,
  isDemoPermissionReference,
  isDemoVaultSchemaName,
  schemaBlockReason
} from "./services/demoDataCleanupRules.js";

test("demo cleanup rules match internal test data names", () => {
  assert.equal(isDemoVaultSchemaName("safety-1783586760301-Financial Preferences"), true);
  assert.equal(isDemoVaultSchemaName("creator-1783586760301-Career Profile"), true);
  assert.equal(isDemoVaultSchemaName("Smoke Travel Preferences"), true);
  assert.equal(isDemoAgentName("My Travel Planner 2"), true);
  assert.equal(isDemoDocumentTitle("Smoke Vault Item 1783717548722"), true);
});

test("demo cleanup rules keep normal B2C names", () => {
  assert.equal(isDemoVaultSchemaName("Financial Preferences"), false);
  assert.equal(isDemoVaultSchemaName("Medical History"), false);
  assert.equal(isDemoAgentName("Trip Companion"), false);
  assert.equal(isDemoDocumentTitle("Passport Details"), false);
});

test("schema cleanup blocks real-looking references", () => {
  assert.equal(schemaBlockReason({
    documentTitles: ["Passport Details"],
    permissionRefs: []
  }), "referenced by non-demo private info");

  assert.equal(schemaBlockReason({
    documentTitles: ["Smoke Vault Item 1783717548722"],
    permissionRefs: [{ userId: "local-clean-user", agentName: "Trip Companion" }]
  }), "referenced by non-demo helper permissions");

  assert.equal(schemaBlockReason({
    documentTitles: ["Smoke Vault Item 1783717548722"],
    permissionRefs: [{ userId: "safety-1783586760301-user", agentName: "safety-1783586760301-Helper" }]
  }), "");
});

test("permission references are disposable when user or agent is test-owned", () => {
  assert.equal(isDemoPermissionReference({ userId: "safety-123-user", agentName: "Trip Companion" }), true);
  assert.equal(isDemoPermissionReference({ userId: "real-user", agentName: "Smoke Helper" }), true);
  assert.equal(isDemoPermissionReference({ userId: "real-user", agentName: "Trip Companion" }), false);
});
