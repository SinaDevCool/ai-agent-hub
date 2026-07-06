import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Database,
  Download,
  FilePlus,
  FileSearch,
  KeyRound,
  LogOut,
  Mail,
  MessageSquare,
  Pencil,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Zap
} from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut, setApiAccessToken } from "./api/client";
import { isAuthConfigured, supabase, type AuthSession } from "./api/supabaseClient";
import type { ActivityLog, Agent, HitlRequest, VaultDocument, VaultSchema } from "./api/types";
import { StatusPill } from "./components/StatusPill";

type RealtimeEvent = { type: string; payload: unknown };
type SectionId = "agents" | "vault" | "clearance" | "activity" | "settings";
type AgentDraft = {
  name: string;
  category: string;
  apiProtocol: string;
  description: string;
  tools: string[];
  requestedSchemas: string[];
  highRiskActionsText: string;
};
type VaultItemDraft = {
  title: string;
  vaultSchemaId: string;
  content: string;
};
type AgentTemplate = {
  id: string;
  title: string;
  category: string;
  starterName: string;
  description: string;
  tools: string[];
  requestedSchemas: string[];
  highRiskActions: string[];
  summary: string;
};

const navItems: Array<{ id: SectionId; label: string; icon: typeof Bot }> = [
  { id: "agents", label: "AI Agents", icon: Bot },
  { id: "vault", label: "Personal Info", icon: Database },
  { id: "clearance", label: "Permissions", icon: KeyRound },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings }
];

const categoryOptions = ["Financial", "Executive", "Wellness", "Domestic", "Legal", "Travel", "Maintenance", "Custom"];
const toolOptions = ["vault.search", "action.execute", "calendar.read", "email.draft", "web.fetch"];
const WS_URL = import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname}:4141/ws`;

const agentTemplates: AgentTemplate[] = [
  {
    id: "travel",
    title: "Travel planner",
    category: "Travel",
    starterName: "My Travel Planner",
    description: "Plans trips using my travel preferences and pauses before non-refundable bookings.",
    tools: ["vault.search", "action.execute"],
    requestedSchemas: ["Frequent Flyer Ledger", "Personal Identity Profile"],
    highRiskActions: ["book_non_refundable_travel"],
    summary: "Good for flights, hotels, loyalty details, and trip planning."
  },
  {
    id: "money",
    title: "Money helper",
    category: "Financial",
    starterName: "My Money Helper",
    description: "Checks financial preferences and asks before purchases, transfers, or credit decisions.",
    tools: ["vault.search", "action.execute"],
    requestedSchemas: ["Financial Preferences"],
    highRiskActions: ["transfer_funds", "open_credit_card"],
    summary: "Good for budgeting, card preferences, and payment guardrails."
  },
  {
    id: "inbox",
    title: "Inbox assistant",
    category: "Executive",
    starterName: "My Inbox Assistant",
    description: "Drafts replies and helps summarize tasks while asking before anything is sent.",
    tools: ["vault.search", "email.draft"],
    requestedSchemas: ["Personal Identity Profile"],
    highRiskActions: ["send_email", "share_personal_info"],
    summary: "Good for email drafts, follow-ups, and contact context."
  },
  {
    id: "shopping",
    title: "Shopping assistant",
    category: "Domestic",
    starterName: "My Shopping Assistant",
    description: "Uses preferences to compare options and asks before buying anything.",
    tools: ["vault.search", "action.execute"],
    requestedSchemas: ["Financial Preferences"],
    highRiskActions: ["buy_item", "share_payment_info"],
    summary: "Good for shopping decisions without surprise purchases."
  },
  {
    id: "health",
    title: "Health organizer",
    category: "Wellness",
    starterName: "My Health Organizer",
    description: "Organizes health notes and always asks before sharing sensitive information.",
    tools: ["vault.search"],
    requestedSchemas: ["Medical History", "Personal Identity Profile"],
    highRiskActions: ["share_medical_record"],
    summary: "Good for organizing private health context with tight controls."
  },
  {
    id: "custom",
    title: "Custom agent",
    category: "Custom",
    starterName: "",
    description: "",
    tools: ["vault.search"],
    requestedSchemas: [],
    highRiskActions: [],
    summary: "Start blank and choose access yourself."
  }
];

const initialAgentDraft: AgentDraft = {
  name: "",
  category: "Custom",
  apiProtocol: "MCP",
  description: "",
  tools: ["vault.search"],
  requestedSchemas: [],
  highRiskActionsText: ""
};
const initialVaultItemDraft: VaultItemDraft = {
  title: "",
  vaultSchemaId: "",
  content: ""
};

function toggleListValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function parseHighRiskActions(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function friendlyToolName(tool: string) {
  const labels: Record<string, string> = {
    "vault.search": "Read personal info",
    "action.execute": "Take actions",
    "calendar.read": "Read calendar",
    "email.draft": "Draft email",
    "web.fetch": "Browse the web"
  };
  return labels[tool] ?? tool;
}

function friendlyActionName(action: string) {
  return action.replace(/_/g, " ");
}

function getStarterPrompt(templateId: string) {
  const prompts: Record<string, string> = {
    travel: "Plan a weekend trip using my preferences",
    money: "Find the spending rule I should follow",
    inbox: "Draft a polite follow-up email",
    shopping: "Compare options without buying anything",
    health: "Summarize the health note I saved"
  };
  return prompts[templateId] ?? "Find the personal info this helper can use";
}

function getStarterInfoPlaceholder(templateId: string) {
  const placeholders: Record<string, string> = {
    travel: "Example: I prefer aisle seats, vegetarian meals, and hotels near public transit.",
    money: "Example: Ask me before purchases over 200 dollars. I prefer cash flow stability over rewards.",
    inbox: "Example: My usual tone is warm and brief. Never send email without my approval.",
    shopping: "Example: I prefer durable items, compare prices first, and ask me before any purchase.",
    health: "Example: Keep health notes private and ask before sharing anything with another service."
  };
  return placeholders[templateId] ?? "Add one useful preference or rule this helper should remember.";
}

function getAvailableAgentName(baseName: string, existingNames: string[]) {
  const normalized = new Set(existingNames.map((name) => name.toLowerCase()));
  if (!normalized.has(baseName.toLowerCase())) return baseName;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${baseName} ${index}`;
    if (!normalized.has(candidate.toLowerCase())) return candidate;
  }
  return `${baseName} ${Date.now()}`;
}

function friendlyLogText(log: ActivityLog) {
  const agent = log.agent?.name ?? "System";
  if (log.actionType === "vault_read") return `${agent} read personal info`;
  if (log.actionType === "vault_write") return `${agent} changed personal info`;
  if (log.actionType === "permission_requested") return log.status === "success" ? `${agent} was granted access` : `${agent} access was revoked or blocked`;
  if (log.actionType === "execution_triggered") return `${agent} tried to take an action`;
  if (log.actionType === "agent_created") return `${agent} was added`;
  if (log.actionType === "indexing_completed") return "Personal info was indexed";
  return `${agent} activity`;
}

function friendlyNotificationText(log: ActivityLog) {
  if (log.actionType !== "hitl_requested") return "";
  const status = String(log.dynamicMetadata?.notificationStatus ?? "");
  if (status === "sent") return "Email notification sent";
  if (status === "skipped") return "Email notification not configured";
  if (status === "failed") return "Email notification failed";
  return "";
}

function friendlyResult(result: Record<string, unknown>) {
  const status = String(result.status ?? "ok");
  if (status === "ok" && Array.isArray(result.documents)) return `Found ${result.documents.length} matching personal info item${result.documents.length === 1 ? "" : "s"}.`;
  if (status === "blocked") return `Blocked: ${String(result.reason ?? "this agent does not have permission.")}`;
  if (status === "awaiting_human_approval") return "Needs your approval before this action can continue.";
  if (status === "vault_item_created") return "Personal info saved.";
  if (status === "vault_item_updated") return "Personal info updated.";
  if (status === "vault_item_deleted") return "Personal info deleted.";
  if (status === "vault_file_uploaded") return "File uploaded into Personal Info.";
  return status.replace(/_/g, " ");
}

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(isAuthConfigured);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [schemas, setSchemas] = useState<VaultSchema[]>([]);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [hitl, setHitl] = useState<HitlRequest[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [connectionState, setConnectionState] = useState("connecting");
  const [toolResult, setToolResult] = useState<string>("No agent action yet.");
  const [activeSection, setActiveSection] = useState<SectionId>("agents");
  const [isAddingAgent, setIsAddingAgent] = useState(false);
  const [agentWizardStep, setAgentWizardStep] = useState(1);
  const [selectedTemplateId, setSelectedTemplateId] = useState("travel");
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(initialAgentDraft);
  const [createAgentError, setCreateAgentError] = useState("");
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [grantingSchemaName, setGrantingSchemaName] = useState("");
  const [isAddingVaultItem, setIsAddingVaultItem] = useState(false);
  const [vaultItemDraft, setVaultItemDraft] = useState<VaultItemDraft>(initialVaultItemDraft);
  const [isCreatingVaultItem, setIsCreatingVaultItem] = useState(false);
  const [createVaultItemError, setCreateVaultItemError] = useState("");
  const [editingDocumentId, setEditingDocumentId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSchemaId, setSearchSchemaId] = useState("");
  const [searchResults, setSearchResults] = useState<VaultDocument[]>([]);
  const [isSearchingVault, setIsSearchingVault] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatTranscript, setChatTranscript] = useState<Array<{ role: "user" | "agent"; content: string }>>([]);
  const [grantDuration, setGrantDuration] = useState("3600000");
  const [permissionDetailsOpen, setPermissionDetailsOpen] = useState(false);
  const [isGuidedSetupOpen, setIsGuidedSetupOpen] = useState(false);
  const [guidedSetupStep, setGuidedSetupStep] = useState(1);
  const [guidedTemplateId, setGuidedTemplateId] = useState("travel");
  const [guidedInfoText, setGuidedInfoText] = useState("");
  const [guidedSetupError, setGuidedSetupError] = useState("");
  const [isGuidedSetupSaving, setIsGuidedSetupSaving] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setApiAccessToken(data.session?.access_token);
      setIsAuthLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setApiAccessToken(nextSession?.access_token);
      setIsAuthLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function refresh() {
    const [agentData, schemaData, documentData, logData, hitlData] = await Promise.all([
      apiGet<{ agents: Agent[] }>("/api/agents"),
      apiGet<{ schemas: VaultSchema[] }>("/api/vault/schemas"),
      apiGet<{ documents: VaultDocument[] }>("/api/vault/documents"),
      apiGet<{ logs: ActivityLog[] }>("/api/activity"),
      apiGet<{ requests: HitlRequest[] }>("/api/hitl")
    ]);
    setAgents(agentData.agents);
    setSchemas(schemaData.schemas);
    setDocuments(documentData.documents);
    setLogs(logData.logs);
    setHitl(hitlData.requests);
    setSelectedAgentId((current) => current || agentData.agents[0]?.id || "");
  }

  useEffect(() => {
    if (isAuthConfigured && !session) return;

    void refresh();
    const socket = new WebSocket(WS_URL);
    socket.onopen = () => setConnectionState("live");
    socket.onclose = () => setConnectionState("offline");
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data) as RealtimeEvent;
      if (["activity.created", "vault.indexed", "hitl.requested"].includes(event.type)) void refresh();
    };
    return () => socket.close();
  }, [session]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [agents, selectedAgentId]
  );

  const permissionReview = useMemo(() => {
    if (!selectedAgent) return [];
    const requestedSchemas = selectedAgent.capabilityManifest.requestedSchemas ?? [];
    const grantedSchemaIds = new Set(
      selectedAgent.permissions
        .filter((permission) => permission.permissionType === "read" && permission.vaultSchemaId)
        .map((permission) => permission.vaultSchemaId)
    );
    return requestedSchemas.map((schemaName) => {
      const schema = schemas.find((item) => item.name === schemaName);
      return {
        schema,
        schemaName,
        granted: Boolean(schema?.id && grantedSchemaIds.has(schema.id))
      };
    });
  }, [schemas, selectedAgent]);

  const ungrantedRequestedSchemas = useMemo(
    () => permissionReview.filter((item) => item.schema && !item.granted),
    [permissionReview]
  );

  const privacySummary = useMemo(() => ({
    account: session?.user.email ?? "Local development user",
    agents: agents.map((agent) => ({
      name: agent.name,
      category: agent.category,
      canUse: agent.capabilityManifest.tools?.map(friendlyToolName) ?? [],
      canRead: agent.capabilityManifest.requestedSchemas ?? [],
      mustAskBefore: agent.capabilityManifest.highRiskActions?.map(friendlyActionName) ?? []
    })),
    personalInfo: documents.map((document) => ({
      title: document.title,
      category: document.vaultSchema?.name ?? "Uncategorized",
      summary: document.excerpt
    })),
    recentActivity: logs.slice(0, 20).map((log) => ({
      when: log.createdAt,
      status: log.status,
      event: friendlyLogText(log),
      detail: log.dataAccessed
    }))
  }), [agents, documents, logs, session]);

  const pendingApproval = hitl[0];
  const allowedPermissionCount = permissionReview.filter((item) => item.granted).length;
  const activeMobileClass = (section: SectionId) => activeSection === section ? "is-mobile-active" : "";
  const guidedTemplates = agentTemplates.filter((template) => template.id !== "custom");
  const guidedTemplate = guidedTemplates.find((template) => template.id === guidedTemplateId) ?? guidedTemplates[0];
  const guidedAgentName = getAvailableAgentName(guidedTemplate.starterName, agents.map((agent) => agent.name));
  const guidedSchema = schemas.find((schema) => schema.name === guidedTemplate.requestedSchemas[0]);
  const guidedPrompt = getStarterPrompt(guidedTemplate.id);

  async function togglePermission(schema: VaultSchema, enabled: boolean) {
    if (!selectedAgent) return;
    await apiPost("/api/permissions/clearance", {
      agentId: selectedAgent.id,
      vaultSchemaId: schema.id,
      permissionType: "read",
      enabled,
      restrictionRules: { deniedPaths: [], maxRecords: 8, uiGranted: true },
      expiresAt: enabled && grantDuration !== "always" ? new Date(Date.now() + Number(grantDuration)).toISOString() : undefined
    });
    await refresh();
  }

  async function grantRequestedSchema(schema: VaultSchema) {
    setGrantingSchemaName(schema.name);
    try {
      await togglePermission(schema, true);
      setToolResult(`${selectedAgent?.name ?? "This agent"} can now read ${schema.name}.`);
    } finally {
      setGrantingSchemaName("");
    }
  }

  async function grantAllRequestedSchemas() {
    if (ungrantedRequestedSchemas.length === 0) return;
    setGrantingSchemaName("all");
    try {
      for (const item of ungrantedRequestedSchemas) {
        if (item.schema) await togglePermission(item.schema, true);
      }
      setToolResult(`${selectedAgent?.name ?? "This agent"} can now read ${ungrantedRequestedSchemas.length} approved info categories.`);
    } finally {
      setGrantingSchemaName("");
    }
  }

  async function runVaultSearch() {
    if (!selectedAgent) return;
    const result = await apiPost("/api/mcp/tool-call", {
      agentId: selectedAgent.id,
      toolName: "vault.search",
      arguments: { query: "travel preferences and approval thresholds", schema: selectedAgent.capabilityManifest.requestedSchemas?.[0] }
    });
    setToolResult(friendlyResult(result as Record<string, unknown>));
    await refresh();
  }

  async function triggerHighRiskAction() {
    if (!selectedAgent) return;
    const result = await apiPost("/api/mcp/tool-call", {
      agentId: selectedAgent.id,
      toolName: "action.execute",
      arguments: { actionName: "book_non_refundable_travel", amountUsd: 640, destination: "Berlin" }
    });
    setToolResult(friendlyResult(result as Record<string, unknown>));
    await refresh();
  }

  async function reindexVault() {
    await apiPost("/api/vault/reindex");
    setToolResult("Personal info refreshed and indexed.");
    await refresh();
  }

  async function searchVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAgent) return;
    setIsSearchingVault(true);
    try {
      const schema = schemas.find((item) => item.id === searchSchemaId);
      const result = await apiPost<{ status: string; documents?: VaultDocument[]; reason?: string }>("/api/mcp/tool-call", {
        agentId: selectedAgent.id,
        toolName: "vault.search",
        arguments: { query: searchQuery, schema: schema?.name }
      });
      setSearchResults(result.documents ?? []);
      setToolResult(friendlyResult(result as Record<string, unknown>));
      await refresh();
    } finally {
      setIsSearchingVault(false);
    }
  }

  async function runAgentChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAgent || !chatInput.trim()) return;
    const prompt = chatInput.trim();
    setChatTranscript((current) => [...current, { role: "user", content: prompt }]);
    setChatInput("");

    const wantsAction = /book|buy|transfer|execute|approve|reserve|pay/i.test(prompt);
    const result = await apiPost<Record<string, unknown>>("/api/mcp/tool-call", {
      agentId: selectedAgent.id,
      toolName: wantsAction ? "action.execute" : "vault.search",
      arguments: wantsAction
        ? { actionName: "book_non_refundable_travel", request: prompt }
        : { query: prompt, schema: selectedAgent.capabilityManifest.requestedSchemas?.[0] }
    });
    const friendlyMessage = friendlyResult(result);
    setChatTranscript((current) => [...current, { role: "agent", content: friendlyMessage }]);
    setToolResult(friendlyMessage);
    await refresh();
  }

  async function createVaultItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateVaultItemError("");
    setIsCreatingVaultItem(true);
    try {
      const result = await apiPost<{ document: VaultDocument }>("/api/vault/documents", {
        title: vaultItemDraft.title,
        vaultSchemaId: vaultItemDraft.vaultSchemaId || null,
        content: vaultItemDraft.content
      });
      setVaultItemDraft(initialVaultItemDraft);
      setIsAddingVaultItem(false);
      setToolResult(`${result.document.title} was saved to Personal Info.`);
      await refresh();
      scrollToSection("vault");
    } catch (error) {
      setCreateVaultItemError(error instanceof Error ? error.message : "Vault item creation failed.");
    } finally {
      setIsCreatingVaultItem(false);
    }
  }

  async function saveVaultEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDocumentId) return;
    setCreateVaultItemError("");
    setIsCreatingVaultItem(true);
    try {
      const result = await apiPut<{ document: VaultDocument }>(`/api/vault/documents/${editingDocumentId}`, {
        title: vaultItemDraft.title,
        vaultSchemaId: vaultItemDraft.vaultSchemaId || null,
        content: vaultItemDraft.content
      });
      setVaultItemDraft(initialVaultItemDraft);
      setEditingDocumentId("");
      setIsAddingVaultItem(false);
      setToolResult(`${result.document.title} was updated.`);
      await refresh();
    } catch (error) {
      setCreateVaultItemError(error instanceof Error ? error.message : "Vault item update failed.");
    } finally {
      setIsCreatingVaultItem(false);
    }
  }

  function beginEditVaultItem(document: VaultDocument) {
    setEditingDocumentId(document.id);
    setVaultItemDraft({
      title: document.title,
      vaultSchemaId: document.vaultSchema?.id ?? "",
      content: String(document.frontmatter.content ?? document.excerpt)
    });
    setIsAddingVaultItem(true);
    scrollToSection("vault");
  }

  async function deleteVaultItem(document: VaultDocument) {
    const confirmed = window.confirm(`Delete "${document.title}" from your vault?`);
    if (!confirmed) return;
    await apiDelete(`/api/vault/documents/${document.id}`);
    setToolResult(`${document.title} was deleted from Personal Info.`);
    await refresh();
  }

  async function uploadVaultFile(event: FormEvent) {
    const input = event.currentTarget as unknown as {
      files?: { [index: number]: { name: string; text: () => Promise<string> } | undefined };
      value: string;
    };
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!/(\.txt|\.md)$/i.test(file.name)) {
      setToolResult("Upload blocked: this MVP supports .txt and .md files.");
      return;
    }
    const content = await file.text();
    const result = await apiPost<{ document: VaultDocument }>("/api/vault/documents", {
      title: file.name.replace(/\.(txt|md)$/i, ""),
      vaultSchemaId: searchSchemaId || null,
      content
    });
    setToolResult(`${result.document.title} was uploaded to Personal Info.`);
    await refresh();
    scrollToSection("vault");
  }

  async function decideHitl(id: string, approved: boolean) {
    await apiPost(`/api/hitl/${id}/decision`, { approved });
    setToolResult(approved ? "Approved. The agent can continue this action." : "Denied. The agent cannot continue this action.");
    await refresh();
  }

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateAgentError("");
    setIsCreatingAgent(true);
    try {
      const result = await apiPost<{ agent: Agent }>("/api/agents", {
        name: agentDraft.name,
        category: agentDraft.category,
        apiProtocol: agentDraft.apiProtocol,
        description: agentDraft.description,
        tools: agentDraft.tools,
        requestedSchemas: agentDraft.requestedSchemas,
        highRiskActions: parseHighRiskActions(agentDraft.highRiskActionsText)
      });
      setAgentDraft(initialAgentDraft);
      setIsAddingAgent(false);
      setSelectedAgentId(result.agent.id);
      setToolResult(`${result.agent.name} was added. Review its permissions before granting access.`);
      await refresh();
      setSelectedAgentId(result.agent.id);
      scrollToSection("agents");
    } catch (error) {
      setCreateAgentError(error instanceof Error ? error.message : "Agent creation failed.");
    } finally {
      setIsCreatingAgent(false);
    }
  }

  function updateAgentDraft(patch: Partial<AgentDraft>) {
    setAgentDraft((current) => ({ ...current, ...patch }));
  }

  function applyAgentTemplate(template: AgentTemplate) {
    setSelectedTemplateId(template.id);
    setAgentDraft({
      name: template.starterName,
      category: template.category,
      apiProtocol: "MCP",
      description: template.description,
      tools: template.tools,
      requestedSchemas: template.requestedSchemas,
      highRiskActionsText: template.highRiskActions.join(", ")
    });
  }

  function openAgentWizard() {
    const template = agentTemplates.find((item) => item.id === selectedTemplateId) ?? agentTemplates[0];
    applyAgentTemplate(template);
    setCreateAgentError("");
    setAgentWizardStep(1);
    setIsAddingAgent(true);
  }

  function openGuidedSetup(templateId = guidedTemplateId) {
    setGuidedTemplateId(templateId);
    setGuidedSetupStep(1);
    setGuidedInfoText("");
    setGuidedSetupError("");
    setIsAddingAgent(false);
    setIsAddingVaultItem(false);
    setIsGuidedSetupOpen(true);
  }

  async function completeGuidedSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuidedSetupError("");
    setIsGuidedSetupSaving(true);
    try {
      const result = await apiPost<{ agent: Agent }>("/api/agents", {
        name: guidedAgentName,
        category: guidedTemplate.category,
        apiProtocol: "MCP",
        description: guidedTemplate.description,
        tools: guidedTemplate.tools,
        requestedSchemas: guidedTemplate.requestedSchemas,
        highRiskActions: guidedTemplate.highRiskActions
      });

      if (guidedInfoText.trim().length >= 10) {
        await apiPost("/api/vault/documents", {
          title: `${guidedTemplate.title} starter note`,
          vaultSchemaId: guidedSchema?.id ?? null,
          content: guidedInfoText.trim()
        });
      }

      await refresh();
      setSelectedAgentId(result.agent.id);
      setChatInput(guidedPrompt);
      setToolResult(`${result.agent.name} is ready. Review the requested info, then try: "${guidedPrompt}"`);
      setIsGuidedSetupOpen(false);
      setGuidedSetupStep(1);
      setGuidedInfoText("");
      scrollToSection("clearance");
    } catch (error) {
      setGuidedSetupError(error instanceof Error ? error.message : "Guided setup failed.");
    } finally {
      setIsGuidedSetupSaving(false);
    }
  }

  async function revokeSelectedAgentAccess() {
    if (!selectedAgent) return;
    const readPermissions = selectedAgent.permissions.filter((permission) => permission.vaultSchema);
    for (const permission of readPermissions) {
      if (permission.vaultSchema) await togglePermission(permission.vaultSchema, false);
    }
    setToolResult(`All readable personal info access was revoked for ${selectedAgent.name}.`);
  }

  async function revokeAllAgentAccess() {
    for (const agent of agents) {
      for (const permission of agent.permissions.filter((item) => item.vaultSchema)) {
        if (permission.vaultSchema) {
          await apiPost("/api/permissions/clearance", {
            agentId: agent.id,
            vaultSchemaId: permission.vaultSchema.id,
            permissionType: "read",
            enabled: false,
            restrictionRules: {}
          });
        }
      }
    }
    await refresh();
    setToolResult("All agent access to Personal Info was revoked.");
  }

  function exportMyData() {
    const blob = new window.Blob([JSON.stringify(privacySummary, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ai-agent-hub-export.json";
    anchor.click();
    window.URL.revokeObjectURL(url);
    setToolResult("Your workspace export was downloaded.");
  }

  function updateVaultItemDraft(patch: Partial<VaultItemDraft>) {
    setVaultItemDraft((current) => ({ ...current, ...patch }));
  }

  function scrollToSection(id: SectionId) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setAuthMessage("");
    setIsSendingMagicLink(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin }
      });
      if (error) throw error;
      setAuthMessage("Check your email for the sign-in link.");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Could not send sign-in link.");
    } finally {
      setIsSendingMagicLink(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setApiAccessToken("");
    setSession(null);
  }

  if (isAuthConfigured && isAuthLoading) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-mark"><ShieldCheck size={22} /> AI Agent Hub</div>
          <h1>Opening your workspace</h1>
          <p>Checking your private session.</p>
        </section>
      </main>
    );
  }

  if (isAuthConfigured && !session) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-mark"><ShieldCheck size={22} /> AI Agent Hub</div>
          <h1>Sign in to your Personal AI OS</h1>
          <p>Use a magic link to open your private agent workspace.</p>
          <form className="auth-form" onSubmit={(event) => void sendMagicLink(event)}>
            <label>
              <span>Email</span>
              <input
                autoComplete="email"
                inputMode="email"
                onChange={(event) => setEmail(event.currentTarget.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </label>
            <button disabled={isSendingMagicLink} type="submit">
              <Mail size={16} /> {isSendingMagicLink ? "Sending..." : "Send magic link"}
            </button>
          </form>
          {authMessage ? <p className="auth-message">{authMessage}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="nav-rail">
        <div className="brand-mark"><ShieldCheck size={22} /> AI Agent Hub</div>
        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              className={activeSection === id ? "nav-active" : ""}
              key={id}
              onClick={() => scrollToSection(id)}
              type="button"
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Your AI Agent Hub</h1>
            <p>Add AI helpers, choose what they can see, and approve important actions before they happen.</p>
          </div>
          <div className="topbar-actions">
            <StatusPill tone={connectionState === "live" ? "green" : "amber"}><Radio size={14} /> {connectionState}</StatusPill>
            {session ? <span className="user-chip">{session.user.email}</span> : null}
            <button className="topbar-primary" onClick={openAgentWizard} type="button"><Bot size={16} /> Add AI Agent</button>
            <button className="topbar-secondary" onClick={() => setIsAddingVaultItem((current) => !current)} type="button"><FilePlus size={16} /> Add Personal Info</button>
            <label className="upload-button topbar-secondary">
              <Upload size={16} /> Upload
              <input accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void uploadVaultFile(event)} type="file" />
            </label>
            <button className="topbar-secondary" onClick={reindexVault}><FileSearch size={16} /> Refresh Info</button>
            {session ? <button className="topbar-secondary" onClick={() => void signOut()} type="button"><LogOut size={16} /> Sign out</button> : null}
          </div>
        </header>

        <section className="panel quick-start-panel">
          <div>
            <div className="panel-title">Quick Start</div>
            <h2>Set up a useful AI helper in under a minute</h2>
            <p>Pick what you want help with, add one private note, and choose what the helper can request.</p>
          </div>
          <div className="quick-start-actions">
            {guidedTemplates.slice(0, 4).map((template) => (
              <button key={template.id} onClick={() => openGuidedSetup(template.id)} type="button">
                <Bot size={16} /> {template.title}
              </button>
            ))}
          </div>
        </section>

        <section className="mobile-home" aria-label="Mobile overview">
          <div className="mobile-home-card">
            <span className="mobile-label">Protected by default</span>
            <h2>Your AI helpers</h2>
            <p>Add agents, share only the info they need, and approve important actions before they happen.</p>
            <div className="mobile-stat-grid">
              <div><strong>{agents.length}</strong><span>Agents</span></div>
              <div><strong>{documents.length}</strong><span>Info notes</span></div>
              <div><strong>{hitl.length}</strong><span>Approvals</span></div>
            </div>
            <div className="mobile-quick-actions">
              <button onClick={() => openGuidedSetup()} type="button"><Bot size={16} /> Start guided setup</button>
              <button onClick={() => setIsAddingVaultItem((current) => !current)} type="button"><FilePlus size={16} /> Add Personal Info</button>
            </div>
          </div>
          {pendingApproval ? (
            <button className="mobile-alert-card" onClick={() => scrollToSection("clearance")} type="button">
              <span>Needs your approval</span>
              <strong>{pendingApproval.agent.name}</strong>
              <small>{friendlyActionName(pendingApproval.actionName)}</small>
            </button>
          ) : null}
        </section>

        {isGuidedSetupOpen ? (
          <form className="panel guided-setup-panel" onSubmit={(event) => void completeGuidedSetup(event)}>
            <div className="guided-setup-head">
              <div>
                <div className="panel-title">Guided Setup</div>
                <h2>{guidedSetupStep === 1 ? "What should your helper do?" : guidedSetupStep === 2 ? "Add one helpful private note" : "Ready to create your helper"}</h2>
              </div>
              <div className="wizard-steps" aria-label="Guided setup progress">
                {[1, 2, 3].map((step) => (
                  <button className={guidedSetupStep === step ? "step-active" : ""} key={step} onClick={() => setGuidedSetupStep(step)} type="button">
                    {step}
                  </button>
                ))}
              </div>
            </div>

            {guidedSetupStep === 1 ? (
              <section className="wizard-page">
                <div className="template-grid guided-template-grid">
                  {guidedTemplates.map((template) => (
                    <button
                      className={guidedTemplateId === template.id ? "template-card selected" : "template-card"}
                      key={template.id}
                      onClick={() => setGuidedTemplateId(template.id)}
                      type="button"
                    >
                      <strong>{template.title}</strong>
                      <span>{template.summary}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {guidedSetupStep === 2 ? (
              <section className="wizard-page">
                <p className="guided-copy">
                  This stays in your Personal Info. Your new helper will still need permission before reading it.
                </p>
                <label className="risk-field">
                  <span>{guidedSchema ? `${guidedSchema.name} note` : "Private note"}</span>
                  <textarea
                    onChange={(event) => setGuidedInfoText(event.currentTarget.value)}
                    placeholder={getStarterInfoPlaceholder(guidedTemplate.id)}
                    rows={5}
                    value={guidedInfoText}
                  />
                </label>
              </section>
            ) : null}

            {guidedSetupStep === 3 ? (
              <section className="wizard-page">
                <div className="guided-review">
                  <div><strong>Helper</strong><span>{guidedAgentName}</span></div>
                  <div><strong>Can request</strong><span>{guidedTemplate.requestedSchemas.join(", ") || "Nothing yet"}</span></div>
                  <div><strong>Must ask before</strong><span>{guidedTemplate.highRiskActions.map(friendlyActionName).join(", ") || "No risky actions"}</span></div>
                  <div><strong>First thing to try</strong><span>{guidedPrompt}</span></div>
                </div>
                <p className="guided-copy">
                  After this, review the permission request. You stay in control before the helper reads private info or continues a risky action.
                </p>
              </section>
            ) : null}

            {guidedSetupError ? <p className="error-text">{guidedSetupError}</p> : null}
            <div className="button-row">
              {guidedSetupStep > 1 ? <button onClick={() => setGuidedSetupStep((step) => step - 1)} type="button">Back</button> : null}
              {guidedSetupStep < 3 ? <button onClick={() => setGuidedSetupStep((step) => step + 1)} type="button">Next</button> : null}
              {guidedSetupStep === 3 ? (
                <button disabled={isGuidedSetupSaving} type="submit"><Bot size={16} /> {isGuidedSetupSaving ? "Creating..." : "Create helper"}</button>
              ) : null}
              <button onClick={() => setIsGuidedSetupOpen(false)} type="button">Cancel</button>
            </div>
          </form>
        ) : null}

        {isAddingAgent ? (
          <form className="panel add-agent-panel" onSubmit={(event) => void createAgent(event)}>
            <div className="panel-title">Add an AI Agent</div>
            <div className="wizard-steps" aria-label="Agent setup progress">
              {[1, 2, 3, 4].map((step) => (
                <button className={agentWizardStep === step ? "step-active" : ""} key={step} onClick={() => setAgentWizardStep(step)} type="button">
                  {step}
                </button>
              ))}
            </div>

            {agentWizardStep === 1 ? (
              <section className="wizard-page">
                <h2>What kind of helper do you want?</h2>
                <div className="template-grid">
                  {agentTemplates.map((template) => (
                    <button
                      className={selectedTemplateId === template.id ? "template-card selected" : "template-card"}
                      key={template.id}
                      onClick={() => applyAgentTemplate(template)}
                      type="button"
                    >
                      <strong>{template.title}</strong>
                      <span>{template.summary}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {agentWizardStep === 2 ? (
              <section className="wizard-page">
                <h2>Name and describe it</h2>
                <div className="form-grid consumer-form-grid">
                  <label>
                    <span>Agent name</span>
                    <input
                      maxLength={80}
                      onChange={(event) => updateAgentDraft({ name: event.currentTarget.value })}
                      placeholder="My Travel Planner"
                      required
                      value={agentDraft.name}
                    />
                  </label>
                  <label>
                    <span>Agent type</span>
                    <select onChange={(event) => updateAgentDraft({ category: event.currentTarget.value })} value={agentDraft.category}>
                      {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </label>
                  <label className="wide-field">
                    <span>What should it help with?</span>
                    <textarea
                      maxLength={500}
                      minLength={10}
                      onChange={(event) => updateAgentDraft({ description: event.currentTarget.value })}
                      placeholder="Plans trips using my preferences and asks before booking."
                      required
                      rows={3}
                      value={agentDraft.description}
                    />
                  </label>
                </div>
              </section>
            ) : null}

            {agentWizardStep === 3 ? (
              <section className="wizard-page">
                <h2>Choose what it can access</h2>
                <div className="choice-grid consumer-choice-grid">
                  <fieldset>
                    <legend>Personal info this agent can request</legend>
                    {schemas.map((schema) => (
                      <label className="choice-row" key={schema.id}>
                        <input
                          checked={agentDraft.requestedSchemas.includes(schema.name)}
                          onChange={() => updateAgentDraft({ requestedSchemas: toggleListValue(agentDraft.requestedSchemas, schema.name) })}
                          type="checkbox"
                        />
                        <span>{schema.name}</span>
                      </label>
                    ))}
                  </fieldset>
                  <fieldset>
                    <legend>What it may do</legend>
                    {toolOptions.map((tool) => (
                      <label className="choice-row" key={tool}>
                        <input
                          checked={agentDraft.tools.includes(tool)}
                          onChange={() => updateAgentDraft({ tools: toggleListValue(agentDraft.tools, tool) })}
                          type="checkbox"
                        />
                        <span>{friendlyToolName(tool)}</span>
                      </label>
                    ))}
                  </fieldset>
                </div>
              </section>
            ) : null}

            {agentWizardStep === 4 ? (
              <section className="wizard-page">
                <h2>Set approval rules</h2>
                <label className="risk-field">
                  <span>Ask me before</span>
                  <textarea
                    onChange={(event) => updateAgentDraft({ highRiskActionsText: event.currentTarget.value })}
                    placeholder="Buying, booking, sending, or sharing anything important"
                    rows={4}
                    value={agentDraft.highRiskActionsText}
                  />
                </label>
                <div className="review-strip">
                  <div><strong>Connection</strong><span>Starts restricted</span></div>
                  <div><strong>Can request</strong><span>{agentDraft.requestedSchemas.length} info categories</span></div>
                  <div><strong>Approval rules</strong><span>{parseHighRiskActions(agentDraft.highRiskActionsText).length} rules</span></div>
                </div>
              </section>
            ) : null}

            {createAgentError ? <p className="error-text">{createAgentError}</p> : null}
            <div className="button-row">
              {agentWizardStep > 1 ? <button onClick={() => setAgentWizardStep((step) => step - 1)} type="button">Back</button> : null}
              {agentWizardStep < 4 ? <button onClick={() => setAgentWizardStep((step) => step + 1)} type="button">Next</button> : null}
              {agentWizardStep === 4 ? (
                <button disabled={isCreatingAgent} type="submit"><Bot size={16} /> {isCreatingAgent ? "Adding..." : "Add agent"}</button>
              ) : null}
              <button onClick={() => setIsAddingAgent(false)} type="button">Cancel</button>
            </div>
          </form>
        ) : null}

        {isAddingVaultItem ? (
          <form className="panel add-vault-panel" onSubmit={(event) => editingDocumentId ? void saveVaultEdit(event) : void createVaultItem(event)}>
            <div className="panel-title">{editingDocumentId ? "Edit Personal Info" : "Add Personal Info"}</div>
            <div className="form-grid vault-form-grid">
              <label>
                <span>Title</span>
                <input
                  maxLength={120}
                  onChange={(event) => updateVaultItemDraft({ title: event.currentTarget.value })}
                  placeholder="Travel meal preferences"
                  required
                  value={vaultItemDraft.title}
                />
              </label>
              <label>
                <span>Category</span>
                <select
                  onChange={(event) => updateVaultItemDraft({ vaultSchemaId: event.currentTarget.value })}
                  value={vaultItemDraft.vaultSchemaId}
                >
                  <option value="">Uncategorized</option>
                  {schemas.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}
                </select>
              </label>
              <label className="wide-field">
                <span>Private note</span>
                <textarea
                  maxLength={5000}
                  minLength={10}
                  onChange={(event) => updateVaultItemDraft({ content: event.currentTarget.value })}
                  placeholder="I prefer aisle seats, vegetarian meals, and Star Alliance when possible."
                  required
                  rows={4}
                  value={vaultItemDraft.content}
                />
              </label>
            </div>
            {createVaultItemError ? <p className="error-text">{createVaultItemError}</p> : null}
            <div className="button-row">
              <button disabled={isCreatingVaultItem} type="submit">
                <FilePlus size={16} /> {isCreatingVaultItem ? "Saving..." : editingDocumentId ? "Update info" : "Save info"}
              </button>
              <button onClick={() => {
                setIsAddingVaultItem(false);
                setEditingDocumentId("");
                setVaultItemDraft(initialVaultItemDraft);
              }} type="button">Cancel</button>
            </div>
          </form>
        ) : null}

        <section className="grid">
          <div className={`panel agent-list mobile-section ${activeMobileClass("agents")}`} id="agents">
            <div className="panel-title">My AI Agents</div>
            <div className="mobile-panel-actions">
              <button onClick={openAgentWizard} type="button"><Bot size={16} /> Add AI Agent</button>
            </div>
            {agents.map((agent) => (
              <button
                key={agent.id}
                className={agent.id === selectedAgent?.id ? "agent-row selected" : "agent-row"}
                onClick={() => setSelectedAgentId(agent.id)}
              >
                <span>{agent.name}</span>
                <small>{agent.category} / trust {agent.trustScore}</small>
              </button>
            ))}
          </div>

          <div className={`panel detail-panel mobile-section ${activeMobileClass("agents")}`}>
            <div className="panel-title">What This Agent Can Do</div>
            {selectedAgent && (
              <>
                <div className="detail-heading">
                  <div>
                    <h2>{selectedAgent.name}</h2>
                    <p>{selectedAgent.capabilityManifest.description}</p>
                  </div>
                  <StatusPill tone="blue">connected</StatusPill>
                </div>
                <div className="manifest-grid">
                  <div><strong>Can do</strong><span>{selectedAgent.capabilityManifest.tools?.map(friendlyToolName).join(", ")}</span></div>
                  <div><strong>Must ask before</strong><span>{selectedAgent.capabilityManifest.highRiskActions?.map(friendlyActionName).join(", ") || "Nothing listed"}</span></div>
                  <div><strong>Current access</strong><span>{selectedAgent.connections[0]?.connectionStatus ?? "none"}</span></div>
                </div>
                <div className="permission-review">
                  <div className="permission-review-header">
                    <div>
                      <strong>Permissions</strong>
                      <span>{allowedPermissionCount} of {permissionReview.length} info categories allowed</span>
                    </div>
                    <button
                      disabled={ungrantedRequestedSchemas.length === 0 || grantingSchemaName === "all"}
                      onClick={() => void grantAllRequestedSchemas()}
                      type="button"
                    >
                      <KeyRound size={16} /> Allow requested info
                    </button>
                    <button onClick={() => setPermissionDetailsOpen((current) => !current)} type="button">
                      <KeyRound size={16} /> Details
                    </button>
                  </div>
                  {permissionDetailsOpen ? (
                    <div className="permission-details">
                      <label>
                        <span>Allow access for</span>
                        <select onChange={(event) => setGrantDuration(event.currentTarget.value)} value={grantDuration}>
                          <option value="3600000">1 hour</option>
                          <option value="86400000">1 day</option>
                          <option value="always">Always</option>
                        </select>
                      </label>
                      <p className="empty">Access is scoped to your account, this agent, this info category, and the expiry you choose.</p>
                    </div>
                  ) : null}
                  {permissionReview.length === 0 ? (
                    <p className="empty">This agent has not requested access to personal info.</p>
                  ) : permissionReview.map((item) => (
                    <div className="permission-review-row" key={item.schemaName}>
                      <div>
                        <strong>{item.schemaName}</strong>
                        <small>{item.schema?.description ?? "Unknown vault schema"}</small>
                      </div>
                      <StatusPill tone={item.granted ? "green" : item.schema ? "amber" : "red"}>
                        {item.granted ? "allowed" : item.schema ? "needs review" : "unknown"}
                      </StatusPill>
                      <button
                        disabled={!item.schema || item.granted || grantingSchemaName === item.schemaName || grantingSchemaName === "all"}
                        onClick={() => item.schema ? void grantRequestedSchema(item.schema) : undefined}
                        type="button"
                      >
                        Allow
                      </button>
                      {item.schema && item.granted ? (
                        <button onClick={() => void togglePermission(item.schema!, false)} type="button">Revoke</button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="chat-panel">
                  <div className="panel-title">Ask This Agent</div>
                  <form className="chat-form" onSubmit={(event) => void runAgentChat(event)}>
                    <input
                      onChange={(event) => setChatInput(event.currentTarget.value)}
                      placeholder="Ask it to find info or try an action that may need approval..."
                      value={chatInput}
                    />
                    <button type="submit"><MessageSquare size={16} /> Send</button>
                  </form>
                  {chatTranscript.length ? (
                    <div className="chat-transcript">
                      {chatTranscript.slice(-4).map((message, index) => (
                        <pre className={message.role === "user" ? "chat-user" : "chat-agent"} key={`${message.role}-${index}`}>{message.content}</pre>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="button-row">
                  <button onClick={runVaultSearch}><Database size={16} /> Search personal info</button>
                  <button className="danger" onClick={triggerHighRiskAction}><Zap size={16} /> Try approval flow</button>
                  <button onClick={() => void revokeSelectedAgentAccess()} type="button"><KeyRound size={16} /> Revoke access</button>
                </div>
              </>
            )}
          </div>

          <div className={`panel clearance-panel mobile-section ${activeMobileClass("clearance")}`} id="clearance">
            <div className="panel-title">Permission Center</div>
            <p className="mobile-section-intro">Choose what {selectedAgent?.name ?? "this agent"} can read. You can change this anytime.</p>
            {schemas.map((schema) => {
              const granted = Boolean(selectedAgent?.permissions.some((permission) => permission.vaultSchemaId === schema.id && permission.permissionType === "read"));
              return (
                <label className="clearance-row" key={schema.id}>
                  <input type="checkbox" checked={granted} onChange={(event) => void togglePermission(schema, event.currentTarget.checked)} />
                  <span>
                    <strong>{schema.name}</strong>
                    <small>{schema.description}</small>
                  </span>
                </label>
              );
            })}
          </div>

          <div className={`panel vault-panel mobile-section ${activeMobileClass("vault")}`} id="vault">
            <div className="panel-title">Personal Info</div>
            <div className="mobile-panel-actions">
              <button onClick={() => setIsAddingVaultItem((current) => !current)} type="button"><FilePlus size={16} /> Add Personal Info</button>
              <label className="upload-button">
                <Upload size={16} /> Upload
                <input accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void uploadVaultFile(event)} type="file" />
              </label>
              <button onClick={reindexVault} type="button"><FileSearch size={16} /> Refresh Info</button>
            </div>
            <form className="vault-search" onSubmit={(event) => void searchVault(event)}>
              <input
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="Search personal info through the selected agent..."
                required
                value={searchQuery}
              />
              <select onChange={(event) => setSearchSchemaId(event.currentTarget.value)} value={searchSchemaId}>
                <option value="">All allowed categories</option>
                {schemas.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}
              </select>
              <button disabled={isSearchingVault} type="submit"><Search size={16} /> {isSearchingVault ? "Searching..." : "Search Info"}</button>
            </form>
            {searchResults.length ? (
              <div className="search-results">
                <strong>Search results</strong>
                {searchResults.map((document) => (
                  <article className="doc-row" key={`result-${document.id}`}>
                    <strong>{document.title}</strong>
                    <span>{document.vaultSchema?.name ?? "Uncategorized"} / {document.relativePath}</span>
                    <p>{document.excerpt}</p>
                  </article>
                ))}
              </div>
            ) : null}
            {documents.map((document) => (
              <article className="doc-row" key={document.id}>
                <strong>{document.title}</strong>
                <span>{document.vaultSchema?.name ?? "Uncategorized"} / {document.relativePath}</span>
                <p>{document.excerpt}</p>
                <div className="button-row compact-row">
                  <button onClick={() => beginEditVaultItem(document)} type="button"><Pencil size={15} /> Edit</button>
                  <button className="danger" onClick={() => void deleteVaultItem(document)} type="button"><Trash2 size={15} /> Delete</button>
                </div>
              </article>
            ))}
          </div>

          <div className={`panel audit-panel mobile-section ${activeMobileClass("activity")}`} id="activity">
            <div className="panel-title">Activity History</div>
            {logs.slice(0, 8).map((log) => (
              <div className="log-row" key={log.id}>
                <StatusPill tone={log.status === "success" ? "green" : log.status === "pending_human_approval" ? "amber" : "red"}>
                  {log.status === "success" ? "done" : log.status === "pending_human_approval" ? "needs approval" : "blocked"}
                </StatusPill>
                <span>{friendlyLogText(log)}</span>
                {friendlyNotificationText(log) ? <small>{friendlyNotificationText(log)}</small> : null}
                <small>{log.dataAccessed ?? "no detail"} / proof {log.hash.slice(0, 12)}</small>
              </div>
            ))}
          </div>

          <div className={`panel hitl-panel mobile-section ${activeMobileClass("clearance")}`}>
            <div className="panel-title">Needs Your Approval</div>
            {hitl.length === 0 ? <p className="empty">No agent is waiting for approval.</p> : hitl.map((request) => (
              <div className="hitl-row" key={request.id}>
                <strong>{request.agent.name} wants to continue</strong>
                <span>{friendlyActionName(request.actionName)}</span>
                <small>This action is paused until you approve or deny it.</small>
                <div className="button-row">
                  <button onClick={() => void decideHitl(request.id, true)}>Approve</button>
                  <button className="danger" onClick={() => void decideHitl(request.id, false)}>Deny</button>
                </div>
              </div>
            ))}
            <pre>{toolResult}</pre>
          </div>

          <div className={`panel settings-panel mobile-section ${activeMobileClass("settings")}`} id="settings">
            <div className="panel-title">Settings + Privacy</div>
            <div className="settings-grid">
              <div><strong>Account</strong><span>{session?.user.email ?? "Local development user"}</span></div>
              <div><strong>Agents</strong><span>{agents.length}</span></div>
              <div><strong>Personal Info</strong><span>{documents.length}</span></div>
              <div><strong>Activity</strong><span>{logs.length}</span></div>
            </div>
            <div className="privacy-actions">
              <button onClick={exportMyData} type="button"><Download size={16} /> Export my data</button>
              <button onClick={() => void revokeAllAgentAccess()} type="button"><KeyRound size={16} /> Revoke all agent access</button>
              {session ? <button onClick={() => void signOut()} type="button"><LogOut size={16} /> Sign out</button> : null}
            </div>
            <p className="empty">Your workspace data is scoped to your signed-in account. Agents start restricted, and personal info access can be revoked at any time.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
