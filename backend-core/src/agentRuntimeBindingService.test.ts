import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAgentImportManifest } from "./services/agentImportManifestService.js";
import { reviewAgentImportManifest } from "./services/agentImportSafetyReviewService.js";
import { attachRuntimeBindingToManifest, bindAgentRuntime } from "./services/agentRuntimeBindingService.js";
import { previewExternalAgentImport } from "./services/externalAgentImportService.js";

function bind(manifest: ReturnType<typeof buildAgentImportManifest>) {
  return bindAgentRuntime({
    manifest,
    safetyReview: reviewAgentImportManifest(manifest)
  });
}

test("local creator runtime binds as executable", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "creator",
    name: "Research Agent",
    description: "Answers questions inside the hub.",
    category: "Custom",
    capabilityKeys: ["general.research"]
  });

  const binding = bind(manifest);
  assert.equal(binding.status, "bound");
  assert.equal(binding.runtimeKind, "local");
  assert.equal(binding.executable, true);
});

test("workflow runtime with an existing workflow reference binds as executable", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "workflow",
    name: "Travel Workflow",
    description: "Finds travel options through a connected workflow.",
    category: "Travel",
    workflowId: "wf_123",
    providerId: "n8n-personal",
    capabilityKeys: ["travel.search_hotels"]
  });

  const binding = bind(manifest);
  assert.equal(binding.status, "bound");
  assert.equal(binding.runtimeKind, "workflow");
  assert.equal(binding.executable, true);
  assert.equal(binding.workflowId, "wf_123");
});

test("workflow runtime without a workflow reference requires setup", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "workflow",
    name: "Unlinked Workflow",
    description: "Needs a workflow connection before it can run.",
    category: "Custom"
  });

  const binding = bind(manifest);
  assert.equal(binding.status, "setup_required");
  assert.equal(binding.executable, false);
  assert.ok(binding.setupSteps.some((step) => /workflow/i.test(step)));
});

test("MCP runtime prepares a stable provider identity but remains setup-required", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "mcp",
    name: "Travel MCP Agent",
    description: "Searches hotels through a verified MCP endpoint.",
    category: "Travel",
    endpointUrl: "https://agents.example.test/mcp",
    capabilityKeys: ["travel.search_hotels"]
  });

  const first = bind(manifest);
  const second = bind(manifest);
  assert.equal(first.status, "setup_required");
  assert.equal(first.runtimeKind, "mcp");
  assert.equal(first.executable, false);
  assert.equal(first.providerId, second.providerId);
  assert.ok(first.providerId?.startsWith("imported-mcp-"));
});

test("OpenAPI runtime prepares a stable provider identity but remains setup-required", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "openapi",
    name: "Booking API Agent",
    description: "Prepares booking actions through an OpenAPI endpoint.",
    category: "Travel",
    endpointUrl: "https://api.example.test/openapi.json",
    capabilityKeys: ["travel.search_hotels"]
  });

  const binding = bind(manifest);
  assert.equal(binding.status, "setup_required");
  assert.equal(binding.runtimeKind, "openapi");
  assert.equal(binding.executable, false);
  assert.ok(binding.providerId?.startsWith("imported-openapi-"));
});

test("hosted API runtime without an endpoint is blocked", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "hosted_agent",
    name: "Hosted Agent",
    description: "Missing endpoint.",
    category: "Custom"
  });

  const binding = bind(manifest);
  assert.equal(binding.status, "blocked");
  assert.equal(binding.executable, false);
  assert.ok(binding.blockers.some((blocker) => /endpoint/i.test(blocker)));
});

test("manual runtime can be listed but is not executable", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "manual",
    name: "Manual Agent",
    description: "A listed agent without backend execution.",
    category: "Custom"
  });

  const binding = bind(manifest);
  assert.equal(binding.status, "bound");
  assert.equal(binding.runtimeKind, "manual");
  assert.equal(binding.executable, false);
});

test("blocked import safety review blocks runtime binding", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "hosted_agent",
    name: "Unsafe Agent",
    description: "Contains leaked credentials in raw import payload.",
    category: "Custom",
    endpointUrl: "https://api.example.test/run",
    raw: { authorization: "Bearer abcdefghijklmnopqrstuvwxyz123456" }
  });

  const binding = bind(manifest);
  assert.equal(binding.status, "blocked");
  assert.equal(binding.executable, false);
  assert.ok(binding.blockers.some((blocker) => /secret|credential|token/i.test(blocker)));
});

test("runtime binding can be attached to normalized import manifests", () => {
  const manifest = buildAgentImportManifest({
    sourceType: "mcp",
    name: "MCP Agent",
    description: "Uses external tools.",
    category: "Custom",
    endpointUrl: "https://tools.example.test/mcp"
  });

  const runtimeBinding = bind(manifest);
  const attached = attachRuntimeBindingToManifest({ manifest, runtimeBinding });
  assert.equal(attached.runtime.providerId, runtimeBinding.providerId);
  assert.equal(attached.runtimeBinding?.status, "setup_required");
});

test("external import preview exposes setup-required runtime binding", async () => {
  const preview = await previewExternalAgentImport({
    sourceType: "mcp_server",
    endpointUrl: "https://tools.example.test/mcp",
    displayName: "Tools MCP Agent",
    category: "Custom"
  });

  assert.equal(preview.canInstall, true);
  assert.equal(preview.runtimeBinding.status, "setup_required");
  assert.equal(preview.runtimeBinding.executable, false);
  assert.equal(preview.capabilityManifest.normalizedImportManifest.runtimeBinding?.status, "setup_required");
});

test("blocked external import preview exposes blocked runtime binding", async () => {
  const preview = await previewExternalAgentImport({
    sourceType: "mcp_server",
    endpointUrl: "http://localhost:4141/mcp",
    displayName: "Unsafe MCP Agent",
    category: "Custom"
  });

  assert.equal(preview.canInstall, false);
  assert.equal(preview.runtimeBinding.status, "blocked");
  assert.equal(preview.runtimeBinding.executable, false);
  assert.ok(preview.blockers.length > 0);
});
