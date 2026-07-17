export type AgentImportSourceType =
  | "creator"
  | "mcp"
  | "openapi"
  | "workflow"
  | "webhook"
  | "hosted_agent"
  | "manual";

export type AgentImportRuntimeKind =
  | "local"
  | "mcp"
  | "openapi"
  | "workflow"
  | "api"
  | "manual";

export type AgentImportRiskLevel = "low" | "medium" | "high";
export type AgentImportReviewStatus = "safe" | "needs_review" | "blocked";
export type AgentRuntimeBindingStatus = "bound" | "setup_required" | "blocked";
export type AgentRuntimeActivationStatus = "setup_required" | "activating" | "active" | "failed" | "blocked";

export type AgentImportCapability = {
  canonicalCapability: string;
  label: string;
  confidence: number;
  sourceReason: string;
};

export type AgentImportTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  riskLevel: AgentImportRiskLevel;
};

export type AgentImportManifest = {
  schemaVersion: "2026-07-13";
  source: {
    type: AgentImportSourceType;
    platform?: string;
    endpointUrl?: string;
    importedFrom?: string;
  };
  identity: {
    name: string;
    description: string;
    category: string;
    creatorName?: string;
  };
  capabilities: AgentImportCapability[];
  tools: AgentImportTool[];
  permissions: {
    requestedPrivateInfo: string[];
    requestedActions: string[];
    requiresApproval: boolean;
    highRiskActions: string[];
  };
  runtime: {
    kind: AgentImportRuntimeKind;
    providerId?: string;
    workflowId?: string;
    endpointUrl?: string;
  };
  runtimeBinding?: {
    status: AgentRuntimeBindingStatus;
    activationStatus?: AgentRuntimeActivationStatus;
    runtimeKind: AgentImportRuntimeKind;
    executable: boolean;
    providerId?: string;
    providerDefinitionId?: string;
    workflowId?: string;
    endpointUrl?: string;
    activatedAt?: string;
    lastCheckedAt?: string;
    discoveredCapabilities?: string[];
    discoveredTools?: string[];
    blockers: string[];
    setupSteps: string[];
    notes: string[];
  };
  safety: {
    urlReviewed: boolean;
    secretsDetected: boolean;
    riskyActionsDetected: boolean;
    reviewStatus: AgentImportReviewStatus;
    notes: string[];
  };
  raw?: unknown;
};
