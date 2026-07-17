import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAgentImportManifest, buildLegacyCapabilityManifest } from "./services/agentImportManifestService.js";
import { reviewAgentImportManifest } from "./services/agentImportSafetyReviewService.js";
import { previewExternalAgentImport } from "./services/externalAgentImportService.js";

test("safe creator manifest reviews as low-risk safe", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "creator",
    name: "Research Agent",
    description: "Answers everyday research questions inside AI Agent Hub.",
    category: "Custom",
    tools: ["agent.run"],
    capabilityKeys: ["general.research"]
  });

  const review = reviewAgentImportManifest(manifest);
  assert.equal(review.status, "safe");
  assert.equal(review.riskLevel, "low");
  assert.deepEqual(review.blockers, []);
  assert.deepEqual(review.detectedCapabilities, ["general.research"]);
});

test("unsafe MCP endpoint reviews as blocked high risk", () => {
  const manifest = buildLegacyCapabilityManifest({
    sourceType: "mcp_server",
    name: "Local MCP Agent",
    description: "Attempts to connect to a local MCP endpoint.",
    category: "Custom",
    endpointUrl: "http://localhost:4141/mcp",
    verificationStatus: "blocked"
  });

  const review = reviewAgentImportManifest(manifest.normalizedImportManifest);
  assert.equal(review.status, "blocked");
  assert.equal(review.riskLevel, "high");
  assert.ok(review.blockers.some((blocker) => /localhost|https/i.test(blocker)));
});

test("OpenAPI action import reviews as approval-gated high risk", () => {
  const manifest = buildLegacyCapabilityManifest({
    sourceType: "openapi_endpoint",
    name: "Travel Booking Agent",
    description: "Books travel through an OpenAPI endpoint after user approval.",
    category: "Travel",
    endpointUrl: "https://api.example.test/openapi.json",
    tools: ["travel.hold_or_book"],
    capabilityKeys: ["travel.hold_or_book"],
    verificationStatus: "verified"
  });

  const review = reviewAgentImportManifest(manifest.normalizedImportManifest);
  assert.equal(review.status, "needs_review");
  assert.equal(review.riskLevel, "high");
  assert.ok(review.requiredApprovals.includes("share_personal_info"));
  assert.ok(review.warnings.some((warning) => /OpenAPI|outside-world|external actions|approval/i.test(warning)));
});

test("broad MCP execute-style tool reviews as high-risk needs-review", () => {
  const manifest = buildLegacyCapabilityManifest({
    sourceType: "mcp_server",
    name: "Automation MCP Agent",
    description: "Runs broad automation commands through a connected MCP server.",
    category: "Custom",
    endpointUrl: "https://mcp.example.test/run",
    tools: ["shell.execute"],
    capabilityKeys: ["general.research"],
    verificationStatus: "verified"
  });

  const review = reviewAgentImportManifest(manifest.normalizedImportManifest);
  assert.equal(review.status, "needs_review");
  assert.equal(review.riskLevel, "high");
  assert.ok(review.requiredApprovals.includes("shell.execute"));
});

test("secret-like raw import data reviews as blocked", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "hosted_agent",
    name: "Hosted Agent",
    description: "Uses a hosted API runtime but accidentally includes credentials.",
    category: "Custom",
    endpointUrl: "https://agents.example.test/run",
    capabilityKeys: ["general.research"],
    raw: { authorization: "Bearer abcdefghijklmnopqrstuvwxyz123456" }
  });

  const review = reviewAgentImportManifest(manifest);
  assert.equal(review.status, "blocked");
  assert.equal(review.riskLevel, "high");
  assert.ok(review.blockers.some((blocker) => /secret|token|credential|API keys/i.test(blocker)));
});

test("workflow import with known capability reviews safe until actions are requested", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "workflow",
    name: "Hotel Search Workflow",
    description: "Searches hotel options using a connected workflow.",
    category: "Travel",
    workflowId: "workflow-123",
    providerId: "n8n",
    capabilityKeys: ["travel.search_hotels"]
  });

  const review = reviewAgentImportManifest(manifest);
  assert.equal(review.status, "safe");
  assert.equal(review.riskLevel, "low");
  assert.deepEqual(review.detectedCapabilities, ["travel.search_hotels"]);
});

test("external import preview exposes safetyReview without removing legacy manifest fields", async () => {
  const preview = await previewExternalAgentImport({
    sourceType: "openapi_endpoint",
    endpointUrl: "https://api.example.test/openapi.json",
    displayName: "Action Import",
    category: "Travel"
  });

  assert.equal(preview.capabilityManifest.sourceType, "openapi_endpoint");
  assert.equal(preview.safetyReview.status, "needs_review");
  assert.equal(preview.safetyReview.riskLevel, "high");
  assert.ok(preview.warnings.length > 0);
});

test("blocked external import preview includes safetyReview blockers and cannot install", async () => {
  const preview = await previewExternalAgentImport({
    sourceType: "mcp_server",
    endpointUrl: "http://localhost:4141/mcp",
    displayName: "Unsafe Import",
    category: "Custom"
  });

  assert.equal(preview.canInstall, false);
  assert.equal(preview.safetyReview.status, "blocked");
  assert.ok(preview.safetyReview.blockers.some((blocker) => /localhost|https/i.test(blocker)));
});

