import { getConnectorCapability } from "./connectorCapabilityService.js";
import { validateExternalRuntimeUrl } from "./externalRuntimeProxyService.js";
import type { AgentImportManifest, AgentImportRiskLevel } from "../types/agentImportManifest.js";

export type AgentImportSafetyReview = {
  status: "safe" | "needs_review" | "blocked";
  riskLevel: AgentImportRiskLevel;
  blockers: string[];
  warnings: string[];
  requiredApprovals: string[];
  detectedCapabilities: string[];
  detectedPrivateInfo: string[];
  detectedActions: string[];
  notes: string[];
};

const externalRuntimeKinds = new Set(["mcp", "openapi", "api"]);

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function hasPotentialSecret(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return /\b(sk-[A-Za-z0-9_-]{16,}|api[_-]?key|secret|token|password|bearer\s+[A-Za-z0-9._-]{12,})\b/i.test(text);
}

function isHighRiskToolName(name: string) {
  return /\b(book|reserve|pay|payment|transfer|send|delete|execute|shell|browser|filesystem|file_system|email\.send|share|write|modify)\b/i.test(name);
}

function isSensitivePrivateInfo(name: string) {
  return /\b(medical|health|identity|passport|financial|bank|card|travel document|ssn|tax|insurance)\b/i.test(name);
}

function isHighRiskAction(name: string) {
  return /\b(book|reserve|pay|payment|transfer|send|delete|execute|share|write|modify|non[_ -]?refundable)\b/i.test(name);
}

function highestRisk(risks: AgentImportRiskLevel[]): AgentImportRiskLevel {
  if (risks.includes("high")) return "high";
  if (risks.includes("medium")) return "medium";
  return "low";
}

function reviewRuntimeTarget(manifest: AgentImportManifest) {
  const blockers: string[] = [];
  const notes: string[] = [];
  if (!externalRuntimeKinds.has(manifest.runtime.kind)) {
    return { blockers, notes };
  }

  const endpointUrl = manifest.runtime.endpointUrl ?? manifest.source.endpointUrl;
  if (!endpointUrl) {
    blockers.push("External agents need a verified public HTTPS endpoint before they can be imported.");
    return { blockers, notes };
  }

  const decision = validateExternalRuntimeUrl(endpointUrl);
  if (!decision.allowed) {
    blockers.push(decision.reason);
  } else {
    notes.push(`Endpoint host reviewed: ${decision.url.hostname.toLowerCase()}.`);
  }
  return { blockers, notes };
}

function capabilityFindings(manifest: AgentImportManifest) {
  const detectedCapabilities = unique(manifest.capabilities.map((capability) => capability.canonicalCapability));
  const blockers: string[] = [];
  const warnings: string[] = [];
  const unknownCapabilities = detectedCapabilities.filter((capability) => !getConnectorCapability(capability));

  if (!detectedCapabilities.length && manifest.runtime.kind !== "manual") {
    blockers.push("Executable imported agents need at least one mapped capability.");
  }
  if (unknownCapabilities.length) {
    warnings.push(`Some capabilities are not in the canonical catalog yet: ${unknownCapabilities.join(", ")}.`);
  }
  return { detectedCapabilities, blockers, warnings };
}

function approvalFindings(manifest: AgentImportManifest) {
  const highRiskTools = manifest.tools
    .filter((tool) => tool.riskLevel === "high" || isHighRiskToolName(tool.name))
    .map((tool) => tool.name);
  const mediumRiskTools = manifest.tools
    .filter((tool) => tool.riskLevel === "medium")
    .map((tool) => tool.name);
  const sensitivePrivateInfo = manifest.permissions.requestedPrivateInfo.filter(isSensitivePrivateInfo);
  const highRiskActions = unique([
    ...manifest.permissions.highRiskActions,
    ...manifest.permissions.requestedActions.filter(isHighRiskAction),
    ...highRiskTools
  ]);

  const requiredApprovals = unique([
    ...highRiskActions,
    ...sensitivePrivateInfo.map((name) => `private_info:${name}`)
  ]);

  const warnings: string[] = [];
  if (highRiskActions.length) warnings.push("This agent can request sensitive or outside-world actions.");
  if (sensitivePrivateInfo.length) warnings.push("This agent requests sensitive private information.");
  if (mediumRiskTools.length) warnings.push("This agent has tools that should stay permission-scoped.");

  return {
    warnings,
    requiredApprovals,
    detectedPrivateInfo: unique(manifest.permissions.requestedPrivateInfo),
    detectedActions: unique([...manifest.permissions.requestedActions, ...manifest.permissions.highRiskActions, ...highRiskTools]),
    risks: [
      ...manifest.tools.map((tool) => tool.riskLevel),
      ...(requiredApprovals.length ? ["high" as const] : []),
      ...(sensitivePrivateInfo.length || mediumRiskTools.length ? ["medium" as const] : [])
    ]
  };
}

export function reviewAgentImportManifest(manifest: AgentImportManifest): AgentImportSafetyReview {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  if (manifest.safety.reviewStatus === "blocked") {
    blockers.push(...manifest.safety.notes);
  }

  if (manifest.safety.secretsDetected || hasPotentialSecret(manifest.raw)) {
    blockers.push("The import manifest appears to contain secret-like values. Remove API keys, tokens, passwords, or bearer credentials before importing.");
  }

  const runtime = reviewRuntimeTarget(manifest);
  blockers.push(...runtime.blockers);
  notes.push(...runtime.notes);

  const capabilities = capabilityFindings(manifest);
  blockers.push(...capabilities.blockers);
  warnings.push(...capabilities.warnings);

  const approvals = approvalFindings(manifest);
  warnings.push(...approvals.warnings);

  if (manifest.source.type === "openapi" || manifest.runtime.kind === "openapi") {
    warnings.push("OpenAPI imports can expose external actions and should remain approval-gated.");
  }

  notes.push(...manifest.safety.notes);

  const riskLevel = blockers.length
    ? "high"
    : highestRisk([
      ...approvals.risks,
      ...(manifest.source.type === "openapi" || manifest.runtime.kind === "openapi" ? ["high" as const] : []),
      ...(manifest.safety.riskyActionsDetected ? ["high" as const] : []),
      ...(warnings.length ? ["medium" as const] : [])
    ]);

  const status = blockers.length
    ? "blocked"
    : riskLevel === "high" || warnings.length || manifest.safety.reviewStatus === "needs_review"
      ? "needs_review"
      : "safe";

  return {
    status,
    riskLevel,
    blockers: unique(blockers),
    warnings: unique(warnings),
    requiredApprovals: unique(approvals.requiredApprovals),
    detectedCapabilities: capabilities.detectedCapabilities,
    detectedPrivateInfo: approvals.detectedPrivateInfo,
    detectedActions: approvals.detectedActions,
    notes: unique(notes).slice(0, 12)
  };
}

