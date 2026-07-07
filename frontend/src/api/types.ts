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
    tools?: string[];
    requestedSchemas?: string[];
    highRiskActions?: string[];
    description?: string;
  };
  permissions: AgentPermission[];
  connections: Array<{ connectionStatus: string; tokenExpiresAt?: string }>;
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
  installed?: boolean;
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
};
