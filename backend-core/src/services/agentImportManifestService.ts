import type { ApiProtocol, AgentCategory } from "@prisma/client";
import { z } from "zod";
import { mapAgentCapabilities } from "./agentCapabilityMappingService.js";
import { validateExternalRuntimeUrl } from "./externalRuntimeProxyService.js";
import type {
  AgentImportCapability,
  AgentImportManifest,
  AgentImportReviewStatus,
  AgentImportRiskLevel,
  AgentImportRuntimeKind,
  AgentImportSourceType,
  AgentImportTool
} from "../types/agentImportManifest.js";

export type LegacyExternalSourceType = "mcp_server" | "openapi_endpoint";
type LegacySourceType = "native" | LegacyExternalSourceType;

const categorySchema = z.enum(["Financial", "Executive", "Wellness", "Domestic", "Legal", "Travel", "Maintenance", "Custom"]);

const sourceTypeToImportSource = new Map<LegacySourceType, AgentImportSourceType>([
  ["native", "creator"],
  ["mcp_server", "mcp"],
  ["openapi_endpoint", "openapi"]
]);

const sourceTypeToRuntimeKind = new Map<LegacySourceType, AgentImportRuntimeKind>([
  ["native", "local"],
  ["mcp_server", "mcp"],
  ["openapi_endpoint", "openapi"]
]);

const sourceTypeToProtocol = new Map<LegacySourceType, ApiProtocol>([
  ["native", "MCP"],
  ["mcp_server", "MCP"],
  ["openapi_endpoint", "OpenAPI"]
]);

export type BuildAgentImportManifestInput = {
  sourceType: LegacySourceType | AgentImportSourceType;
  name: string;
  description: string;
  category: AgentCategory | z.input<typeof categorySchema> | string;
  endpointUrl?: string;
  platform?: string;
  importedFrom?: string;
  creatorName?: string;
  providerId?: string;
  workflowId?: string;
  protocol?: ApiProtocol;
  tools?: Array<string | AgentImportTool>;
  operations?: Array<{
    operationId?: string;
    path?: string;
    method?: string;
    summary?: string;
    description?: string;
  }>;
  requestedSchemas?: string[];
  highRiskActions?: string[];
  requestedActions?: string[];
  capabilityKeys?: string[];
  capabilityHints?: string[];
  trustReasons?: string[];
  verificationSummary?: string[];
  raw?: unknown;
};

export type LegacyCapabilityManifest = {
  protocol: ApiProtocol;
  sourceType: LegacySourceType;
  externalEndpointUrl?: string;
  verificationStatus: "declared" | "verified" | "blocked";
  verificationSummary: string[];
  tools: string[];
  requestedSchemas: string[];
  highRiskActions: string[];
  description: string;
  examplePrompts: string[];
  trustReasons: string[];
  normalizedImportManifest: AgentImportManifest;
};

function normalizeCategory(category: string) {
  const parsed = categorySchema.safeParse(category);
  return parsed.success ? parsed.data : "Custom";
}

export function legacySourceTypeFor(sourceType: BuildAgentImportManifestInput["sourceType"]): LegacySourceType {
  if (sourceType === "mcp") return "mcp_server";
  if (sourceType === "openapi") return "openapi_endpoint";
  if (sourceType === "creator" || sourceType === "manual") return "native";
  return sourceType === "mcp_server" || sourceType === "openapi_endpoint" || sourceType === "native"
    ? sourceType
    : "native";
}

function importSourceFor(sourceType: LegacySourceType, inputSourceType: BuildAgentImportManifestInput["sourceType"]): AgentImportSourceType {
  if (
    inputSourceType === "creator"
    || inputSourceType === "mcp"
    || inputSourceType === "openapi"
    || inputSourceType === "workflow"
    || inputSourceType === "webhook"
    || inputSourceType === "hosted_agent"
    || inputSourceType === "manual"
  ) {
    return inputSourceType;
  }
  return sourceTypeToImportSource.get(sourceType) ?? "manual";
}

function runtimeKindFor(sourceType: LegacySourceType, input: BuildAgentImportManifestInput): AgentImportRuntimeKind {
  if (input.sourceType === "workflow" || input.sourceType === "webhook") return "workflow";
  if (input.sourceType === "hosted_agent") return "api";
  if (input.sourceType === "manual") return "manual";
  return sourceTypeToRuntimeKind.get(sourceType) ?? "manual";
}

export function protocolForLegacySource(sourceType: LegacySourceType) {
  return sourceTypeToProtocol.get(sourceType) ?? "MCP";
}

export function defaultToolsForSource(sourceType: LegacySourceType) {
  if (sourceType === "mcp_server") return ["vault.search"];
  if (sourceType === "openapi_endpoint") return ["action.execute"];
  return ["agent.run"];
}

export function defaultHighRiskActionsForSource(sourceType: LegacySourceType) {
  return sourceType === "openapi_endpoint" ? ["share_personal_info"] : [];
}

function riskForTool(toolName: string, highRiskActions: string[]): AgentImportRiskLevel {
  if (highRiskActions.includes(toolName)) return "high";
  if (/\b(book|reserve|pay|transfer|send|delete|share|execute)\b/i.test(toolName)) return "high";
  if (/\b(email|finance|health|identity|personal|action)\b/i.test(toolName)) return "medium";
  return "low";
}

function normalizeTools(tools: Array<string | AgentImportTool>, highRiskActions: string[]): AgentImportTool[] {
  return tools.map((tool) => {
    if (typeof tool !== "string") return tool;
    return {
      name: tool,
      riskLevel: riskForTool(tool, highRiskActions)
    };
  });
}

function buildCapabilities(input: BuildAgentImportManifestInput): AgentImportCapability[] {
  const mapping = mapAgentCapabilities({
    name: input.name,
    description: input.description,
    category: String(input.category),
    sourceType: input.sourceType,
    declaredCapabilities: input.capabilityKeys,
    hints: input.capabilityHints,
    tools: (input.tools ?? []).map((tool) => typeof tool === "string" ? { name: tool } : tool),
    operations: input.operations
  });
  return mapping.mappings.map((capability) => {
    return {
      canonicalCapability: capability.canonicalCapability,
      label: capability.label,
      confidence: capability.confidence,
      sourceReason: capability.sourceReason
    };
  });
}

function summarizeUrlSafety(endpointUrl: string | undefined): {
  allowedEndpointUrl?: string;
  urlReviewed: boolean;
  reviewStatus: AgentImportReviewStatus;
  notes: string[];
} {
  if (!endpointUrl) {
    return {
      urlReviewed: false,
      reviewStatus: "safe",
      notes: ["No external endpoint was declared."]
    };
  }
  const decision = validateExternalRuntimeUrl(endpointUrl);
  if (!decision.allowed) {
    return {
      urlReviewed: true,
      reviewStatus: "blocked",
      notes: [decision.reason]
    };
  }
  return {
    allowedEndpointUrl: decision.url.toString(),
    urlReviewed: true,
    reviewStatus: "safe",
    notes: ["Endpoint passed AI Agent Hub's URL safety review."]
  };
}

function hasPotentialSecret(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return /\b(sk-[A-Za-z0-9_-]{16,}|api[_-]?key|secret|token|password|bearer\s+[A-Za-z0-9._-]{12,})\b/i.test(text);
}

export function buildAgentImportManifest(input: BuildAgentImportManifestInput): AgentImportManifest {
  const legacySourceType = legacySourceTypeFor(input.sourceType);
  const highRiskActions = input.highRiskActions ?? defaultHighRiskActionsForSource(legacySourceType);
  const toolNames = input.tools ?? defaultToolsForSource(legacySourceType);
  const normalizedTools = normalizeTools(toolNames, highRiskActions);
  const urlSafety = summarizeUrlSafety(input.endpointUrl);
  const riskyActionsDetected = highRiskActions.length > 0 || normalizedTools.some((tool) => tool.riskLevel === "high");
  const secretsDetected = hasPotentialSecret(input.raw) || hasPotentialSecret(input.endpointUrl);
  const reviewStatus: AgentImportReviewStatus = urlSafety.reviewStatus === "blocked"
    ? "blocked"
    : secretsDetected || riskyActionsDetected
      ? "needs_review"
      : "safe";

  return {
    schemaVersion: "2026-07-13",
    source: {
      type: importSourceFor(legacySourceType, input.sourceType),
      platform: input.platform,
      endpointUrl: urlSafety.allowedEndpointUrl,
      importedFrom: input.importedFrom
    },
    identity: {
      name: input.name.trim(),
      description: input.description.trim(),
      category: normalizeCategory(String(input.category)),
      creatorName: input.creatorName
    },
    capabilities: buildCapabilities(input),
    tools: normalizedTools,
    permissions: {
      requestedPrivateInfo: input.requestedSchemas ?? [],
      requestedActions: input.requestedActions ?? highRiskActions,
      requiresApproval: Boolean(highRiskActions.length || input.requestedActions?.length),
      highRiskActions
    },
    runtime: {
      kind: runtimeKindFor(legacySourceType, input),
      providerId: input.providerId,
      workflowId: input.workflowId,
      endpointUrl: urlSafety.allowedEndpointUrl
    },
    safety: {
      urlReviewed: urlSafety.urlReviewed,
      secretsDetected,
      riskyActionsDetected,
      reviewStatus,
      notes: [
        ...urlSafety.notes,
        ...(riskyActionsDetected ? ["Sensitive or high-risk actions require explicit user approval."] : []),
        ...(secretsDetected ? ["Potential secret-like values were detected and require review."] : []),
        ...(input.verificationSummary ?? [])
      ].slice(0, 8)
    },
    raw: input.raw
  };
}

export function buildLegacyCapabilityManifest(input: BuildAgentImportManifestInput & {
  verificationStatus?: "declared" | "verified" | "blocked";
  examplePrompts?: string[];
}): LegacyCapabilityManifest {
  const legacySourceType = legacySourceTypeFor(input.sourceType);
  const normalizedImportManifest = buildAgentImportManifest(input);
  const toolNames = normalizedImportManifest.tools.map((tool) => tool.name);
  return {
    protocol: input.protocol ?? protocolForLegacySource(legacySourceType),
    sourceType: legacySourceType,
    externalEndpointUrl: normalizedImportManifest.source.endpointUrl,
    verificationStatus: input.verificationStatus ?? (
      normalizedImportManifest.safety.reviewStatus === "blocked" ? "blocked" : "declared"
    ),
    verificationSummary: normalizedImportManifest.safety.notes,
    tools: toolNames,
    requestedSchemas: normalizedImportManifest.permissions.requestedPrivateInfo,
    highRiskActions: normalizedImportManifest.permissions.highRiskActions,
    description: normalizedImportManifest.identity.description,
    examplePrompts: input.examplePrompts?.length
      ? input.examplePrompts
      : [`Ask ${normalizedImportManifest.identity.name} what it can help with.`],
    trustReasons: input.trustReasons?.length
      ? input.trustReasons
      : ["Starts restricted until you approve private info or sensitive actions."],
    normalizedImportManifest
  };
}
