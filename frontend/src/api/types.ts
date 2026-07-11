export type VaultSchema = {
  id: string;
  name: string;
  description: string;
  structuralTemplate: Record<string, unknown>;
};

export type AgentPermission = {
  id: string;
  vaultSchemaId: string | null;
  permissionType: "read" | "write" | "execute_action";
  restrictionRules: Record<string, unknown>;
  vaultSchema?: VaultSchema | null;
};

export type Agent = {
  id: string;
  name: string;
  category: string;
  apiProtocol: string;
  trustScore: number;
  capabilityManifest: {
    protocol?: "MCP" | "OpenAPI";
    sourceType?: "native" | "mcp_server" | "openapi_endpoint";
    externalEndpointUrl?: string;
    verificationStatus?: "declared" | "verified" | "blocked";
    verificationSummary?: string[];
    tools?: string[];
    requestedSchemas?: string[];
    highRiskActions?: string[];
    description?: string;
    examplePrompts?: string[];
    trustReasons?: string[];
  };
  permissions: AgentPermission[];
  connections: Array<{ connectionStatus: string; tokenExpiresAt?: string }>;
};

export type CreatorProfile = {
  id: string;
  userId: string;
  displayName: string;
  bio: string;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CurrentUserCapabilities = {
  canCreateMarketplaceAgents: boolean;
  canModerateMarketplace: boolean;
};

export type CurrentUser = {
  id: string;
  email: string;
  role: "user" | "creator" | "moderator" | "admin";
};

export type CreatorAccessStatus = "pending" | "approved" | "denied";

export type CreatorAccessRequest = {
  id: string;
  userId: string;
  userEmail?: string;
  status: CreatorAccessStatus;
  reason: string;
  reviewNote: string;
  reviewedAt: string | null;
  reviewedByUserId?: string | null;
  reviewedByEmail?: string;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceAgent = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  status: string;
  trustScore: number;
  installCount: number;
  averageRating: number;
  moderationNote?: string;
  submittedForReviewAt?: string | null;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
  installed?: boolean;
  matchScore?: number;
  matchReasons?: string[];
  creator?: {
    displayName: string;
    verified: boolean;
  } | null;
  versions: Array<{
    id: string;
    version: string;
    apiProtocol: string;
    capabilityManifest: Agent["capabilityManifest"];
  }>;
};

export type CreatorAgent = MarketplaceAgent & {
  status: "draft" | "needs_review" | "published" | "archived";
};

export type CreatorReadinessItem = {
  key: string;
  label: string;
  passed: boolean;
  required: boolean;
  severity: "required" | "review" | "info";
  guidance: string;
};

export type CreatorPublishReadiness = {
  outcome: "publish" | "needs_review" | "block";
  message: string;
  code: string;
  items: CreatorReadinessItem[];
};

export type CreatorPublishResult = {
  agent: CreatorAgent;
  readiness: CreatorPublishReadiness;
};

export type CreatorAgentDraftInput = {
  name: string;
  tagline: string;
  description: string;
  category: string;
  apiProtocol: "MCP" | "OpenAPI";
  capabilityManifest: Required<Pick<Agent["capabilityManifest"], "tools" | "requestedSchemas" | "highRiskActions" | "description" | "examplePrompts" | "trustReasons">> & {
    protocol: "MCP" | "OpenAPI";
    sourceType?: "native" | "mcp_server" | "openapi_endpoint";
    externalEndpointUrl?: string;
    verificationStatus?: "declared" | "verified" | "blocked";
    verificationSummary?: string[];
  };
  releaseNotes?: string;
};

export type UserAgentInstall = {
  id: string;
  displayName: string;
  connectionStatus: string;
  installedAt: string;
  agentDefinition: MarketplaceAgent;
  agentVersion: {
    id: string;
    version: string;
    apiProtocol: string;
    capabilityManifest: Agent["capabilityManifest"];
  };
  agent?: Agent | null;
};

export type ExternalAgentImportInput = {
  sourceType: "mcp_server" | "openapi_endpoint";
  endpointUrl: string;
  displayName?: string;
  category?: string;
};

export type ExternalAgentImportPreview = {
  sourceType: "mcp_server" | "openapi_endpoint";
  sourceLabel: string;
  endpointHost: string;
  displayName: string;
  category: string;
  protocol: "MCP" | "OpenAPI";
  verificationStatus: "verified" | "blocked";
  canInstall: boolean;
  blockers: string[];
  warnings: string[];
  capabilityManifest: Agent["capabilityManifest"] & {
    protocol: "MCP" | "OpenAPI";
    sourceType: "mcp_server" | "openapi_endpoint";
    verificationStatus: "verified" | "blocked";
    verificationSummary: string[];
    tools: string[];
    requestedSchemas: string[];
    highRiskActions: string[];
    description: string;
    examplePrompts: string[];
    trustReasons: string[];
  };
};

export type VaultDocument = {
  id: string;
  title: string;
  relativePath: string;
  frontmatter: Record<string, unknown>;
  excerpt: string;
  indexedAt: string;
  vaultSchema?: VaultSchema | null;
};

export type ActivityLog = {
  id: string;
  actionType: string;
  status: string;
  dataAccessed?: string;
  dynamicMetadata?: Record<string, unknown>;
  hash: string;
  previousHash?: string;
  createdAt: string;
  agent?: Agent | null;
};

export type HitlRequest = {
  id: string;
  actionName: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  agent: Agent;
};

export type AgentMessage = {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  status?: "success" | "blocked_by_policy" | "pending_human_approval" | "error" | null;
  intent?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AgentConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  agent?: Agent | null;
  messages: AgentMessage[];
};

export type AgentRunResult = {
  status: "ok" | "blocked" | "awaiting_human_approval";
  intent: "search" | "action" | "blocked";
  reply: string;
  reason?: string;
  runtimeState?: "ready" | "needs_permission" | "needs_approval" | "blocked" | "failed";
  nextStep?: string;
  missingPermissions?: string[];
  actionName?: string;
  requestId?: string;
  usedSchemas?: string[];
  documents?: VaultDocument[];
  conversation?: AgentConversation;
  provider?: "openai" | "local";
  model?: string;
  providerFallbackReason?: string;
  externalRuntime?: {
    source: "external_agent_runtime";
    sourceType: "mcp_server" | "openapi_endpoint";
    endpointHost?: string;
    proxyStatus?: "executed" | "blocked" | "timed_out" | "failed" | "pending_human_approval" | "prepared";
    durationMs?: number;
    blockedReason?: string;
  };
};
