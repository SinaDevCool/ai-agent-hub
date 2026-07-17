import type { ConnectorAction, ConnectorCapability } from "../connectorCapabilityService.js";
import type { NormalizedConnectorResult } from "../connectorResultNormalizer.js";
import type { ToolExecutionInput, ToolExecutionResult } from "../tools/toolExecutionTypes.js";

export type ProviderKind = "workflow" | "oauth_api" | "native" | "mcp" | "openapi" | "api" | "browser" | "manual";
export type ProviderAuthType = "none" | "api_key" | "oauth" | "connected_account" | "mcp" | "workflow_secret";
export type ProviderRiskLevel = "low" | "medium" | "high";
export type ProviderSchemaFieldType = "string" | "number" | "boolean" | "date" | "object" | "array";
export type ProviderCredentialType = "none" | "api_key" | "oauth" | "connected_account" | "bearer_token";
export type ProviderCredentialFieldType = "text" | "password" | "url" | "email";

export type ProviderCredentialField = {
  key: string;
  label: string;
  type: ProviderCredentialFieldType;
  required: boolean;
  helpText?: string;
  placeholder?: string;
};

export type ProviderOAuthConfig = {
  authUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
  clientIdEnvKey?: string;
  clientSecretEnvKey?: string;
  redirectPath?: string;
};

export type ProviderRuntimeConfig = {
  endpointUrl?: string;
  healthEndpointUrl?: string;
  healthMethod?: "GET" | "HEAD";
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxResponseBytes?: number;
  authHeaderName?: string;
  authCredentialKey?: string;
  resultPath?: string;
  operations?: Array<{
    operationId?: string;
    capabilityKey?: string;
    action?: ConnectorAction;
    path?: string;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    summary?: string;
    description?: string;
  }>;
  mcpTools?: Array<{
    name: string;
    capabilityKey?: string;
    action?: ConnectorAction;
    description?: string;
  }>;
};

export type ProviderActionSchema = {
  capabilityKey: string;
  action: ConnectorAction;
  riskLevel: ProviderRiskLevel;
  requiresApproval: boolean;
  inputSchema: Record<string, { type: ProviderSchemaFieldType; description?: string }>;
  requiredFields: string[];
  outputSchema?: Record<string, unknown>;
  examples: Array<Record<string, unknown>>;
  userPrompt: string;
  missingInputMessage: string;
  allowExtraFields: boolean;
};

export type ProviderCapabilityContract = {
  key: string;
  label: string;
  category: string;
  description: string;
  defaultAction: ConnectorAction;
  risk: ProviderRiskLevel;
  actions: ConnectorAction[];
};

export type ProviderExecutionInput = {
  userId: string;
  agentId: string;
  agentRunId?: string;
  capability: ConnectorCapability;
  action: ConnectorAction;
  input: Record<string, unknown>;
  idempotencyKey?: string;
  attempt: number;
  previousToolRunId?: string;
  approvalOverride?: ToolExecutionInput["approvalOverride"];
  providerConnection?: {
    id: string;
    status: string;
    displayName: string;
    credentials: Record<string, unknown>;
  };
};

export type ProviderExecutionResult = ToolExecutionResult;

export type ProviderCanHandleInput = {
  capabilityKey: string;
  action: ConnectorAction;
  preferredProviderId?: string;
};

export type ProviderHealthCheckResult = {
  state: "healthy" | "degraded" | "failing" | "not_configured" | "disabled";
  message: string;
  checkedAt: string;
  retryable?: boolean;
  nextAction?: string;
};

export type ProviderAdapter = {
  providerId: string;
  label: string;
  kind: ProviderKind;
  toolName: string;
  capabilities: string[];
  actions: ConnectorAction[];
  requiresConnectedAccount: boolean;
  credentialType?: ProviderCredentialType;
  credentialFields?: ProviderCredentialField[];
  oauthConfig?: ProviderOAuthConfig;
  authType: ProviderAuthType;
  riskLevel: ProviderRiskLevel;
  description: string;
  supportsHealthCheck: boolean;
  runtimeConfig?: ProviderRuntimeConfig;
  actionSchemas?: ProviderActionSchema[];
  canHandle(input: ProviderCanHandleInput): boolean;
  execute(input: ProviderExecutionInput): Promise<ProviderExecutionResult>;
  healthCheck?(input: { userId: string; agentId?: string; capabilityKey?: string }): Promise<ProviderHealthCheckResult>;
  normalizeResult?(input: {
    capabilityKey: string;
    action: ConnectorAction;
    providerId: string;
    providerLabel: string;
    toolRunId: string;
    rawResult?: Record<string, unknown>;
  }): NormalizedConnectorResult;
};
