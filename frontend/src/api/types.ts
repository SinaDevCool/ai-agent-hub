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
  display?: RuntimeActivityDisplay;
  hash: string;
  previousHash?: string;
  createdAt: string;
  agent?: Agent | null;
};

export type RuntimeActivityDisplay = {
  title: string;
  summary: string;
  badge: string;
  category: "private_info" | "approval" | "provider" | "agent_management" | "system";
  nextStep?: string;
  agentName?: string;
  privateInfoUsed: string[];
  externalService?: string;
  approvalStatus?: "waiting" | "allowed" | "denied";
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
  metadata: AgentMessageMetadata;
  createdAt: string;
};

export type AgentMessageMetadata = Record<string, unknown> & {
  display?: ChatMessageDisplay;
};

export type ChatMessageDisplay = {
  title: string;
  body: string;
  badge: string;
  tone: "blue" | "amber" | "green" | "red";
  category: "answer" | "permission" | "approval" | "provider" | "workflow" | "system";
  nextStep?: string;
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
  intent: "search" | "action" | "workflow" | "email_search" | "email_draft" | "calendar_free_time" | "document_search" | "blocked";
  reply: string;
  display?: ChatMessageDisplay;
  reason?: string;
  runtimeState?: "ready" | "needs_permission" | "needs_approval" | "blocked" | "failed";
  nextStep?: string;
  missingPermissions?: string[];
  actionName?: string;
  requestId?: string;
  usedSchemas?: string[];
  documents?: VaultDocument[];
  conversation?: AgentConversation;
  provider?: "openai" | "local" | "workflow";
  model?: string;
  providerFallbackReason?: string;
  workflowResult?: WorkflowResultCard;
  providerReceipt?: ProviderReceipt;
  externalRuntime?: {
    source: "external_agent_runtime";
    sourceType: "mcp_server" | "openapi_endpoint";
    endpointHost?: string;
    proxyStatus?: "executed" | "blocked" | "timed_out" | "failed" | "pending_human_approval" | "prepared";
    durationMs?: number;
    blockedReason?: string;
  };
};

export type WorkflowResultItem = {
  title: string;
  subtitle?: string;
  detail?: string;
  price?: string;
  url?: string;
  metadata?: Record<string, string>;
};

export type WorkflowResultAction = {
  label: string;
  url?: string;
  value?: string;
};

export type WorkflowResultCard = {
  status: "ok" | "failed";
  quality: "complete" | "partial" | "empty" | "malformed";
  title: string;
  summary: string;
  items: WorkflowResultItem[];
  nextActions: WorkflowResultAction[];
  receipt: {
    workflowConnectionId: string;
    workflowName: string;
    capabilityKey: string;
    capabilityLabel: string;
    provider: string;
    endpointHost: string;
    providerStatus?: number;
    externalRequestId?: string;
  };
};

export type ProviderReceiptDisplay = {
  title: string;
  summary: string;
  badge: string;
  category: "provider";
  agentName: string;
  externalService: string;
  nextStep?: string | null;
  itemCount?: number;
};

export type ProviderReceipt = {
  id: string;
  agentId: string;
  agentName: string;
  providerId: string;
  providerLabel: string;
  capabilityKey: string;
  capabilityLabel: string;
  action: string;
  status: "succeeded" | "blocked" | "waiting_for_approval";
  approvalRequired: boolean;
  hitlRequestId: string | null;
  resultQuality: string | null;
  userMessage: string;
  retryable: boolean;
  nextAction: string | null;
  itemCount: number;
  externalRequestId: string | null;
  endpointHost: string | null;
  metadata: Record<string, unknown>;
  display?: ProviderReceiptDisplay;
  createdAt: string;
};

export type ConnectedAccount = {
  id: string;
  provider: string;
  accountLabel: string;
  scopes: string[];
  expiresAt: string | null;
  status: "active" | "expired" | "revoked" | "error";
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConnectorStartResponse = {
  status: "ready" | "not_configured" | "unsupported";
  provider: string;
  authorizationUrl: string | null;
  scopes?: string[];
  missing?: string[];
  message: string;
};

export type WorkflowConnectionStatus = "draft" | "active" | "failed" | "disabled";

export type WorkflowProvider = "n8n" | "make" | "zapier" | "custom";

export type WorkflowConnection = {
  id: string;
  userId: string;
  agentId: string | null;
  toolName: string;
  capabilityKey: string;
  capability: WorkflowCapability | null;
  description: string;
  name: string;
  provider: WorkflowProvider;
  endpointUrl: string;
  status: WorkflowConnectionStatus;
  lastTestedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowConnectionInput = {
  name: string;
  provider: WorkflowProvider;
  endpointUrl: string;
  agentId?: string | null;
  toolName?: string;
  capabilityKey?: string;
  description?: string;
};

export type WorkflowCapability = {
  key: string;
  label: string;
  category: string;
  description: string;
  contract: {
    receives: Record<string, unknown>;
    returns: Record<string, unknown>;
    requiredFields: string[];
    optionalFields: string[];
    outputKeys: string[];
    tips: string[];
  };
};

export type WorkflowCreateResponse = {
  workflow: WorkflowConnection;
  signingSecret: string;
  setup: {
    signatureHeader: string;
    timestampHeader: string;
    workflowIdHeader: string;
  };
};

export type WorkflowTestResponse =
  | { ok: true; workflow: WorkflowConnection | null; result: Record<string, unknown> & { workflowResult?: WorkflowResultCard } }
  | { ok: false; workflow: WorkflowConnection | null; reason: string };

export type LifeExecutionLevel = "discover" | "compare" | "prepare" | "redirect" | "transact" | "manage";
export type LifeTransactionState = "draft" | "validated" | "awaiting_approval" | "executing" | "confirmed" | "failed" | "uncertain" | "reconciliation_required" | "cancelled" | "expired";
export type LifeCapability = { key: string; label: string; domain: string; description: string; executionLevels: LifeExecutionLevel[]; defaultAction: string; risk: "low" | "medium" | "high"; dataClass: "standard" | "personal" | "financial" | "health" | "high_risk"; approvalRequired: boolean };
export type LifeProvider = { id: string; label: string; domains: string[]; capabilities: string[]; regions: string[]; executionLevels: LifeExecutionLevel[]; auth: string; access: "public" | "developer_account" | "partner_approval" | "regulated_partner" | "local_user"; officialDocs: string; notes: string };
export type LifeProviderReadiness = { providerId: string; state: "ready" | "adapter_required" | "adapter_disabled" | "connection_required" | "reconnect_required" | "connection_error"; executable: boolean; adapterStatus: string; connectionStatus: string; healthStatus: string; nextStep: string };
export type SandboxFlightOffer = { id: string; carrier: string; origin: string; destination: string; departureDate: string; amount: string; currency: string; refundable: boolean; expiresAt: string };
export type SandboxHotelOffer = { id: string; propertyName: string; destination: string; checkInDate: string; checkOutDate: string; guests: number; rooms: number; amount: string; currency: string; refundable: boolean; expiresAt: string };
export type SandboxGroundOffer = { id: string; mode: "rail" | "bus" | "transfer"; operator: string; origin: string; destination: string; departureAt: string; arrivalAt: string; amount: string; currency: string; redirectUrl: null };
export type SandboxItinerary = { sandbox: true; items: Array<{ transactionId: string; capabilityKey: string; reference: string | null; status: string; details: Record<string, unknown>; calendarEvent: unknown }> };
export type SandboxCancellationQuote = { transactionId: string; bookingReference: string | null; refundable: boolean; refundAmount: string; currency: string; expiresAt: string };
export type FinanceSummary = { sandbox: boolean; readOnly: true; accounts: Array<{ id: string; name: string; mask: string | null; currency: string; currentBalance: number | null; availableBalance: number | null; dataFreshAt: string | null }>; transactions: Array<{ id: string; name: string; merchantName: string | null; amount: number; currency: string; date: string; pending: boolean; categoryPrimary: string | null }>; totals: { spending: number; income: number; netCashFlow: number; currency: string }; categories: Array<{ category: string; amount: number }>; recurring: Array<{ id: string; name: string; amount: number; currency: string }>; dataFreshAt: string | null };
export type SandboxAppointmentSlot = { id: string; externalProviderId: string; providerName: string; specialty: string; location: string; startsAt: string; endsAt: string; timeZone: string; bookingMode: "sandbox" };
export type SandboxProductOffer = { id: string; title: string; merchant: string; amount: string; currency: string; inStock: boolean; checkoutMode: "sandbox"; expiresAt: string };
export type ShoppingList = { id: string; name: string; items: Array<{ id: string; name: string; quantity: number; checked: boolean }>; createdAt: string; updatedAt: string };
export type SandboxHouseholdProvider = { id: string; name: string; serviceType: string; location: string; rating: number; reviewCount: number; verified: boolean; mode: "sandbox" };
export type SandboxHouseholdQuote = { id: string; provider: SandboxHouseholdProvider; description: string; amount: string; currency: string; estimatedMinutes: number; availableAt: string; expiresAt: string; mode: "sandbox" };
export type SandboxRestaurantSlot = { id: string; restaurantId: string; restaurantName: string; cuisine: string; location: string; dateTime: string; partySize: number; mode: "sandbox" };
export type SandboxEvent = { id: string; name: string; location: string; startsAt: string; category: string; priceFrom: string; currency: string; purchaseUrl: null; mode: "sandbox" };
export type SandboxHomeDevice = { entityId: string; name: string; room: string; kind: "light" | "thermostat" | "plug"; state: string; allowedCommands: string[]; mode: "sandbox" };
export type SandboxEnergyAnalysis = { sandbox: true; readOnly: true; startDate: string; endDate: string; currency: string; totalKwh: number; estimatedCost: number; carbonKg: number; peakHour: string; recommendations: string[]; source: string };
export type SandboxWellnessActivity = { sandbox: true; readOnly: true; healthAdvice: false; source: string; startDate: string; endDate: string; days: number; totals: { steps: number; activeMinutes: number; distanceKm: number; sleepHours: number }; dailyAverages: { steps: number; activeMinutes: number; sleepHours: number }; notice: string };
export type Appointment = { id: string; providerId: string; externalProviderId: string; providerName: string; specialty: string; location: string; startsAt: string; endsAt: string; timeZone: string; status: "requested" | "confirmed" | "cancelled"; confirmationCode: string | null; calendarEvent: Record<string, unknown>; createdAt: string; updatedAt: string };
export type LifeTransaction = { id: string; capabilityKey: string; executionLevel: LifeExecutionLevel; state: LifeTransactionState; region: string | null; providerId: string | null; providerCandidates: string[]; approvalRequired: boolean; hitlRequestId: string | null; idempotencyKey: string; input: Record<string, unknown>; result: Record<string, unknown>; externalReference: string | null; failureReason: string | null; createdAt: string; updatedAt: string; completedAt: string | null };
