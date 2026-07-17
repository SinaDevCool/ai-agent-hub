import { sha256 } from "./cryptoService.js";
import type { AgentImportSafetyReview } from "./agentImportSafetyReviewService.js";
import type { AgentImportManifest, AgentImportRuntimeKind, AgentRuntimeBindingStatus } from "../types/agentImportManifest.js";

export type AgentRuntimeBindingResult = {
  status: AgentRuntimeBindingStatus;
  runtimeKind: AgentImportRuntimeKind;
  executable: boolean;
  providerId?: string;
  providerDefinitionId?: string;
  workflowId?: string;
  endpointUrl?: string;
  blockers: string[];
  setupSteps: string[];
  notes: string[];
};

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function endpointHash(endpointUrl: string | undefined, fallback: string) {
  return sha256((endpointUrl || fallback).trim().toLowerCase()).slice(0, 12);
}

function stableProviderId(kind: AgentImportRuntimeKind, manifest: AgentImportManifest) {
  const hash = endpointHash(manifest.runtime.endpointUrl ?? manifest.source.endpointUrl, `${kind}:${manifest.identity.name}`);
  if (kind === "mcp") return `imported-mcp-${hash}`;
  if (kind === "openapi") return `imported-openapi-${hash}`;
  if (kind === "api") return `imported-api-${hash}`;
  if (kind === "manual") return `imported-manual-${hash}`;
  return undefined;
}

function result(input: Omit<AgentRuntimeBindingResult, "blockers" | "setupSteps" | "notes"> & {
  blockers?: string[];
  setupSteps?: string[];
  notes?: string[];
}): AgentRuntimeBindingResult {
  return {
    ...input,
    blockers: unique(input.blockers ?? []),
    setupSteps: unique(input.setupSteps ?? []),
    notes: unique(input.notes ?? [])
  };
}

export function bindAgentRuntime(input: {
  manifest: AgentImportManifest;
  safetyReview: AgentImportSafetyReview;
}): AgentRuntimeBindingResult {
  const { manifest, safetyReview } = input;
  const runtimeKind = manifest.runtime.kind;
  const endpointUrl = manifest.runtime.endpointUrl ?? manifest.source.endpointUrl;

  if (safetyReview.status === "blocked") {
    return result({
      status: "blocked",
      runtimeKind,
      executable: false,
      endpointUrl,
      blockers: safetyReview.blockers,
      setupSteps: ["Fix the blocked import review before enabling this runtime."],
      notes: ["Runtime binding stopped because import safety review is blocked."]
    });
  }

  if (runtimeKind === "local") {
    return result({
      status: "bound",
      runtimeKind,
      executable: true,
      notes: ["Local creator agent can run through AI Agent Hub's internal runtime."]
    });
  }

  if (runtimeKind === "workflow") {
    if (manifest.runtime.workflowId || manifest.runtime.providerId) {
      return result({
        status: "bound",
        runtimeKind,
        executable: true,
        providerId: manifest.runtime.providerId,
        workflowId: manifest.runtime.workflowId,
        notes: ["Workflow runtime is linked to an existing workflow/provider reference."]
      });
    }
    return result({
      status: "setup_required",
      runtimeKind,
      executable: false,
      setupSteps: ["Connect or create a workflow for this agent."],
      notes: ["Workflow imports reuse WorkflowConnection infrastructure."]
    });
  }

  if (runtimeKind === "mcp") {
    if (!endpointUrl) {
      return result({
        status: "blocked",
        runtimeKind,
        executable: false,
        blockers: ["MCP imports need a verified endpoint before runtime binding."],
        setupSteps: ["Add a public HTTPS MCP endpoint."]
      });
    }
    return result({
      status: "setup_required",
      runtimeKind,
      executable: false,
      providerId: manifest.runtime.providerId ?? stableProviderId("mcp", manifest),
      endpointUrl,
      setupSteps: ["Inspect MCP tools before enabling execution."],
      notes: ["MCP runtime identity is prepared without creating a duplicate provider table."]
    });
  }

  if (runtimeKind === "openapi") {
    if (!endpointUrl) {
      return result({
        status: "blocked",
        runtimeKind,
        executable: false,
        blockers: ["OpenAPI imports need a verified specification endpoint before runtime binding."],
        setupSteps: ["Add a public HTTPS OpenAPI endpoint."]
      });
    }
    return result({
      status: "setup_required",
      runtimeKind,
      executable: false,
      providerId: manifest.runtime.providerId ?? stableProviderId("openapi", manifest),
      endpointUrl,
      setupSteps: ["Import OpenAPI operations before enabling execution."],
      notes: ["OpenAPI runtime identity is prepared for later action schema import."]
    });
  }

  if (runtimeKind === "api") {
    if (!endpointUrl) {
      return result({
        status: "blocked",
        runtimeKind,
        executable: false,
        blockers: ["Hosted API agents need a verified endpoint before runtime binding."],
        setupSteps: ["Add a public HTTPS API endpoint."]
      });
    }
    return result({
      status: "setup_required",
      runtimeKind,
      executable: false,
      providerId: manifest.runtime.providerId ?? stableProviderId("api", manifest),
      endpointUrl,
      setupSteps: ["Add provider authentication and action schema before execution."],
      notes: ["Hosted API runtime identity is prepared for provider-definition binding."]
    });
  }

  return result({
    status: "bound",
    runtimeKind: "manual",
    executable: false,
    providerId: manifest.runtime.providerId ?? stableProviderId("manual", manifest),
    notes: ["Manual agents can be listed but do not execute backend tools."]
  });
}

export function attachRuntimeBindingToManifest(input: {
  manifest: AgentImportManifest;
  runtimeBinding: AgentRuntimeBindingResult;
}): AgentImportManifest {
  return {
    ...input.manifest,
    runtime: {
      ...input.manifest.runtime,
      providerId: input.runtimeBinding.providerId ?? input.manifest.runtime.providerId,
      workflowId: input.runtimeBinding.workflowId ?? input.manifest.runtime.workflowId,
      endpointUrl: input.runtimeBinding.endpointUrl ?? input.manifest.runtime.endpointUrl
    },
    runtimeBinding: input.runtimeBinding
  };
}

