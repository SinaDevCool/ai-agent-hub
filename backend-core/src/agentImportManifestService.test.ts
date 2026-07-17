import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAgentImportManifest,
  buildLegacyCapabilityManifest,
  legacySourceTypeFor
} from "./services/agentImportManifestService.js";

test("normalizes creator agents into a local runtime manifest", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "creator",
    name: "Personal Research Agent",
    description: "Researches everyday questions and keeps results inside the hub.",
    category: "Custom",
    tools: ["agent.run"],
    requestedSchemas: [],
    highRiskActions: [],
    capabilityKeys: ["general.research"]
  });

  assert.equal(manifest.source.type, "creator");
  assert.equal(manifest.runtime.kind, "local");
  assert.equal(manifest.safety.reviewStatus, "safe");
  assert.equal(manifest.capabilities[0]?.canonicalCapability, "general.research");
});

test("normalizes MCP imports without losing legacy capability manifest fields", () => {
  const manifest = buildLegacyCapabilityManifest({
    sourceType: "mcp_server",
    name: "Travel MCP Agent",
    description: "Finds travel options through an external MCP server while staying restricted.",
    category: "Travel",
    endpointUrl: "https://agents.example.test/mcp",
    tools: ["travel.search_hotels"],
    capabilityKeys: ["travel.search_hotels"],
    verificationStatus: "verified"
  });

  assert.equal(manifest.protocol, "MCP");
  assert.equal(manifest.sourceType, "mcp_server");
  assert.equal(manifest.externalEndpointUrl, "https://agents.example.test/mcp");
  assert.deepEqual(manifest.tools, ["travel.search_hotels"]);
  assert.equal(manifest.normalizedImportManifest.source.type, "mcp");
  assert.equal(manifest.normalizedImportManifest.runtime.kind, "mcp");
  assert.equal(manifest.normalizedImportManifest.capabilities[0]?.canonicalCapability, "travel.search_hotels");
});

test("normalizes OpenAPI imports as approval-gated external action runtimes", () => {
  const manifest = buildLegacyCapabilityManifest({
    sourceType: "openapi_endpoint",
    name: "Booking Action Agent",
    description: "Prepares bookings through an OpenAPI endpoint after the user approves sensitive actions.",
    category: "Travel",
    endpointUrl: "https://api.example.test/openapi.json",
    tools: ["travel.hold_or_book"],
    capabilityKeys: ["travel.hold_or_book"],
    verificationStatus: "verified"
  });

  assert.equal(manifest.protocol, "OpenAPI");
  assert.equal(manifest.sourceType, "openapi_endpoint");
  assert.deepEqual(manifest.highRiskActions, ["share_personal_info"]);
  assert.equal(manifest.normalizedImportManifest.runtime.kind, "openapi");
  assert.equal(manifest.normalizedImportManifest.permissions.requiresApproval, true);
  assert.equal(manifest.normalizedImportManifest.safety.reviewStatus, "needs_review");
});

test("normalizes workflow/webhook imports without creating another workflow system", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "workflow",
    name: "Inbox Workflow Agent",
    description: "Drafts follow-up messages using a connected workflow endpoint.",
    category: "Executive",
    workflowId: "workflow-123",
    providerId: "n8n-personal",
    capabilityKeys: ["email.follow_up"],
    requestedActions: ["draft_email"]
  });

  assert.equal(manifest.source.type, "workflow");
  assert.equal(manifest.runtime.kind, "workflow");
  assert.equal(manifest.runtime.workflowId, "workflow-123");
  assert.equal(manifest.runtime.providerId, "n8n-personal");
  assert.equal(manifest.capabilities[0]?.canonicalCapability, "email.follow_up");
  assert.equal(manifest.permissions.requiresApproval, true);
});

test("blocks unsafe external endpoints in the normalized safety block", () => {
  const manifest = buildLegacyCapabilityManifest({
    sourceType: "mcp_server",
    name: "Unsafe MCP Agent",
    description: "Attempts to import a local MCP server endpoint.",
    category: "Custom",
    endpointUrl: "http://localhost:4141/mcp",
    verificationStatus: "blocked"
  });

  assert.equal(manifest.externalEndpointUrl, undefined);
  assert.equal(manifest.verificationStatus, "blocked");
  assert.equal(manifest.normalizedImportManifest.safety.urlReviewed, true);
  assert.equal(manifest.normalizedImportManifest.safety.reviewStatus, "blocked");
  assert.ok(manifest.normalizedImportManifest.safety.notes.some((note) => /https|localhost/i.test(note)));
});

test("maps public import source aliases to legacy source types", () => {
  assert.equal(legacySourceTypeFor("mcp"), "mcp_server");
  assert.equal(legacySourceTypeFor("openapi"), "openapi_endpoint");
  assert.equal(legacySourceTypeFor("creator"), "native");
});
