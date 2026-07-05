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
