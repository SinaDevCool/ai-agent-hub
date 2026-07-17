import type { NormalizedWorkflowResult } from "./workflowResultNormalizer.js";
import type { SerializedProviderReceipt } from "./providerReceiptService.js";
import type { RuntimeChatDisplay } from "./runtimeChatDisplayService.js";

export type RuntimeIntent = "search" | "action" | "workflow" | "email_search" | "email_draft" | "calendar_free_time" | "blocked";

export type RuntimeAgent = {
  id: string;
  name: string;
  capabilityManifest: string;
};

export type AgentCapabilityManifest = {
  protocol?: "MCP" | "OpenAPI";
  sourceType?: "native" | "mcp_server" | "openapi_endpoint";
  externalEndpointUrl?: string;
  verificationStatus?: "declared" | "verified" | "blocked";
  verificationSummary?: string[];
  tools?: string[];
  requestedSchemas?: string[];
  highRiskActions?: string[];
  description?: string;
  normalizedImportManifest?: unknown;
};

export type RuntimeResult = {
  status: "ok" | "blocked" | "awaiting_human_approval";
  intent: RuntimeIntent;
  reply: string;
  display?: RuntimeChatDisplay;
  reason?: string;
  runtimeState?: "ready" | "needs_permission" | "needs_approval" | "blocked" | "failed";
  nextStep?: string;
  missingPermissions?: string[];
  actionName?: string;
  requestId?: string;
  usedSchemas?: string[];
  documents?: unknown[];
  provider?: "openai" | "local" | "workflow";
  providerFallbackReason?: string;
  model?: string;
  workflowResult?: NormalizedWorkflowResult;
  providerReceipt?: SerializedProviderReceipt;
  externalRuntime?: {
    source: "external_agent_runtime";
    sourceType: "mcp_server" | "openapi_endpoint";
    endpointHost?: string;
    proxyStatus?: "executed" | "blocked" | "timed_out" | "failed" | "pending_human_approval" | "prepared";
    durationMs?: number;
    blockedReason?: string;
  };
};

export type RuntimeStep = {
  title: string;
  toolRunId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
};

export type RuntimeBranchResult = {
  result: RuntimeResult;
  step?: RuntimeStep;
};
