export type RuntimeIntent = "search" | "action" | "blocked";

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
};

export type RuntimeResult = {
  status: "ok" | "blocked" | "awaiting_human_approval";
  intent: RuntimeIntent;
  reply: string;
  reason?: string;
  runtimeState?: "ready" | "needs_permission" | "needs_approval" | "blocked" | "failed";
  nextStep?: string;
  missingPermissions?: string[];
  actionName?: string;
  requestId?: string;
  usedSchemas?: string[];
  documents?: unknown[];
  provider?: "openai" | "local";
  providerFallbackReason?: string;
  model?: string;
  externalRuntime?: {
    source: "external_agent_runtime";
    sourceType: "mcp_server" | "openapi_endpoint";
    endpointHost?: string;
    proxyStatus?: "executed" | "blocked" | "timed_out" | "failed" | "pending_human_approval" | "prepared";
    durationMs?: number;
    blockedReason?: string;
  };
};
