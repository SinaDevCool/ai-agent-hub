import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Database,
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

const navItems: Array<{ id: SectionId; label: string; icon: typeof Bot }> = [
  { id: "agents", label: "Agents", icon: Bot },
  { id: "vault", label: "Information Vault", icon: Database },
  { id: "clearance", label: "Access Clearance", icon: KeyRound },
  { id: "activity", label: "Activity Log", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings }
];

const categoryOptions = ["Financial", "Executive", "Wellness", "Domestic", "Legal", "Travel", "Maintenance", "Custom"];
const toolOptions = ["vault.search", "action.execute", "calendar.read", "email.draft", "web.fetch"];
const WS_URL = import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname}:4141/ws`;

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
  const [toolResult, setToolResult] = useState<string>("No tool call executed yet.");
  const [activeSection, setActiveSection] = useState<SectionId>("agents");
  const [isAddingAgent, setIsAddingAgent] = useState(false);
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
      setToolResult(JSON.stringify({ status: "permission_granted", schema: schema.name, agent: selectedAgent?.name }, null, 2));
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
      setToolResult(JSON.stringify({
        status: "permissions_granted",
        schemas: ungrantedRequestedSchemas.map((item) => item.schemaName),
        agent: selectedAgent?.name
      }, null, 2));
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
    setToolResult(JSON.stringify(result, null, 2));
    await refresh();
  }

  async function triggerHighRiskAction() {
    if (!selectedAgent) return;
    const result = await apiPost("/api/mcp/tool-call", {
      agentId: selectedAgent.id,
      toolName: "action.execute",
      arguments: { actionName: "book_non_refundable_travel", amountUsd: 640, destination: "Berlin" }
    });
    setToolResult(JSON.stringify(result, null, 2));
    await refresh();
  }

  async function reindexVault() {
    const result = await apiPost("/api/vault/reindex");
    setToolResult(JSON.stringify(result, null, 2));
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
      setToolResult(JSON.stringify(result, null, 2));
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
    setChatTranscript((current) => [...current, { role: "agent", content: JSON.stringify(result, null, 2) }]);
    setToolResult(JSON.stringify(result, null, 2));
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
      setToolResult(JSON.stringify({ status: "vault_item_created", document: result.document }, null, 2));
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
      setToolResult(JSON.stringify({ status: "vault_item_updated", document: result.document }, null, 2));
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
    setToolResult(JSON.stringify({ status: "vault_item_deleted", documentId: document.id }, null, 2));
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
      setToolResult(JSON.stringify({ status: "upload_blocked", reason: "Only .txt and .md files are supported in this MVP." }, null, 2));
      return;
    }
    const content = await file.text();
    const result = await apiPost<{ document: VaultDocument }>("/api/vault/documents", {
      title: file.name.replace(/\.(txt|md)$/i, ""),
      vaultSchemaId: searchSchemaId || null,
      content
    });
    setToolResult(JSON.stringify({ status: "vault_file_uploaded", document: result.document }, null, 2));
    await refresh();
    scrollToSection("vault");
  }

  async function decideHitl(id: string, approved: boolean) {
    const result = await apiPost(`/api/hitl/${id}/decision`, { approved });
    setToolResult(JSON.stringify(result, null, 2));
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
      setToolResult(JSON.stringify({ agent: result.agent, status: "created" }, null, 2));
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
            <h1>Personal AI Operating System</h1>
            <p>Local-first vault mediation, MCP proxying, and policy-bound real-world execution.</p>
          </div>
          <div className="topbar-actions">
            <StatusPill tone={connectionState === "live" ? "green" : "amber"}><Radio size={14} /> {connectionState}</StatusPill>
            {session ? <span className="user-chip">{session.user.email}</span> : null}
            <button onClick={() => setIsAddingAgent((current) => !current)} type="button"><Bot size={16} /> Add Agent</button>
            <button onClick={() => setIsAddingVaultItem((current) => !current)} type="button"><FilePlus size={16} /> Add Vault Item</button>
            <label className="upload-button">
              <Upload size={16} /> Upload
              <input accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void uploadVaultFile(event)} type="file" />
            </label>
            <button onClick={reindexVault}><FileSearch size={16} /> Reindex vault</button>
            {session ? <button onClick={() => void signOut()} type="button"><LogOut size={16} /> Sign out</button> : null}
          </div>
        </header>

        {isAddingAgent ? (
          <form className="panel add-agent-panel" onSubmit={(event) => void createAgent(event)}>
            <div className="panel-title">Add Agent</div>
            <div className="form-grid">
              <label>
                <span>Name</span>
                <input
                  maxLength={80}
                  onChange={(event) => updateAgentDraft({ name: event.currentTarget.value })}
                  placeholder="Portfolio Scout"
                  required
                  value={agentDraft.name}
                />
              </label>
              <label>
                <span>Category</span>
                <select onChange={(event) => updateAgentDraft({ category: event.currentTarget.value })} value={agentDraft.category}>
                  {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label>
                <span>Protocol</span>
                <select onChange={(event) => updateAgentDraft({ apiProtocol: event.currentTarget.value })} value={agentDraft.apiProtocol}>
                  <option value="MCP">MCP</option>
                  <option value="OpenAPI">OpenAPI</option>
                </select>
              </label>
              <label className="wide-field">
                <span>Description</span>
                <textarea
                  maxLength={500}
                  minLength={10}
                  onChange={(event) => updateAgentDraft({ description: event.currentTarget.value })}
                  placeholder="Summarizes portfolio context and flags spending decisions for approval."
                  required
                  rows={3}
                  value={agentDraft.description}
                />
              </label>
            </div>

            <div className="choice-grid">
              <fieldset>
                <legend>Tools</legend>
                {toolOptions.map((tool) => (
                  <label className="choice-row" key={tool}>
                    <input
                      checked={agentDraft.tools.includes(tool)}
                      onChange={() => updateAgentDraft({ tools: toggleListValue(agentDraft.tools, tool) })}
                      type="checkbox"
                    />
                    <span>{tool}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Requested Vault Schemas</legend>
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
              <label className="risk-field">
                <span>High-Risk Actions</span>
                <textarea
                  onChange={(event) => updateAgentDraft({ highRiskActionsText: event.currentTarget.value })}
                  placeholder="transfer_funds, book_non_refundable_travel"
                  rows={4}
                  value={agentDraft.highRiskActionsText}
                />
              </label>
            </div>

            <div className="review-strip">
              <div><strong>Connection</strong><span>restricted</span></div>
              <div><strong>Vault access</strong><span>{agentDraft.requestedSchemas.length} requested, 0 granted</span></div>
              <div><strong>Actions</strong><span>{parseHighRiskActions(agentDraft.highRiskActionsText).length} high-risk</span></div>
            </div>
            {createAgentError ? <p className="error-text">{createAgentError}</p> : null}
            <div className="button-row">
              <button disabled={isCreatingAgent} type="submit"><Bot size={16} /> {isCreatingAgent ? "Creating..." : "Create agent"}</button>
              <button onClick={() => setIsAddingAgent(false)} type="button">Cancel</button>
            </div>
          </form>
        ) : null}

        {isAddingVaultItem ? (
          <form className="panel add-vault-panel" onSubmit={(event) => editingDocumentId ? void saveVaultEdit(event) : void createVaultItem(event)}>
            <div className="panel-title">{editingDocumentId ? "Edit Vault Item" : "Add Vault Item"}</div>
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
                <span>Schema</span>
                <select
                  onChange={(event) => updateVaultItemDraft({ vaultSchemaId: event.currentTarget.value })}
                  value={vaultItemDraft.vaultSchemaId}
                >
                  <option value="">Uncategorized</option>
                  {schemas.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}
                </select>
              </label>
              <label className="wide-field">
                <span>Content</span>
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
                <FilePlus size={16} /> {isCreatingVaultItem ? "Saving..." : editingDocumentId ? "Update vault item" : "Save vault item"}
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
          <div className="panel agent-list" id="agents">
            <div className="panel-title">Agent Registry</div>
            {agents.map((agent) => (
              <button
                key={agent.id}
                className={agent.id === selectedAgent?.id ? "agent-row selected" : "agent-row"}
                onClick={() => setSelectedAgentId(agent.id)}
              >
                <span>{agent.name}</span>
                <small>{agent.category} / Trust {agent.trustScore}</small>
              </button>
            ))}
          </div>

          <div className="panel detail-panel">
            <div className="panel-title">Capability Manifest</div>
            {selectedAgent && (
              <>
                <div className="detail-heading">
                  <div>
                    <h2>{selectedAgent.name}</h2>
                    <p>{selectedAgent.capabilityManifest.description}</p>
                  </div>
                  <StatusPill tone="blue">{selectedAgent.apiProtocol}</StatusPill>
                </div>
                <div className="manifest-grid">
                  <div><strong>Tools</strong><span>{selectedAgent.capabilityManifest.tools?.join(", ")}</span></div>
                  <div><strong>High risk</strong><span>{selectedAgent.capabilityManifest.highRiskActions?.join(", ") || "None"}</span></div>
                  <div><strong>Connection</strong><span>{selectedAgent.connections[0]?.connectionStatus ?? "none"}</span></div>
                </div>
                <div className="permission-review">
                  <div className="permission-review-header">
                    <div>
                      <strong>Permission Review</strong>
                      <span>{permissionReview.length} requested / {permissionReview.filter((item) => item.granted).length} granted</span>
                    </div>
                    <button
                      disabled={ungrantedRequestedSchemas.length === 0 || grantingSchemaName === "all"}
                      onClick={() => void grantAllRequestedSchemas()}
                      type="button"
                    >
                      <KeyRound size={16} /> Grant requested access
                    </button>
                    <button onClick={() => setPermissionDetailsOpen((current) => !current)} type="button">
                      <KeyRound size={16} /> Details
                    </button>
                  </div>
                  {permissionDetailsOpen ? (
                    <div className="permission-details">
                      <label>
                        <span>Grant duration</span>
                        <select onChange={(event) => setGrantDuration(event.currentTarget.value)} value={grantDuration}>
                          <option value="3600000">1 hour</option>
                          <option value="86400000">1 day</option>
                          <option value="always">Always</option>
                        </select>
                      </label>
                      <p className="empty">Access is scoped to your account, the selected agent, schema, and expiry.</p>
                    </div>
                  ) : null}
                  {permissionReview.length === 0 ? (
                    <p className="empty">This agent has not requested vault access.</p>
                  ) : permissionReview.map((item) => (
                    <div className="permission-review-row" key={item.schemaName}>
                      <div>
                        <strong>{item.schemaName}</strong>
                        <small>{item.schema?.description ?? "Unknown vault schema"}</small>
                      </div>
                      <StatusPill tone={item.granted ? "green" : item.schema ? "amber" : "red"}>
                        {item.granted ? "granted" : item.schema ? "requested" : "unknown"}
                      </StatusPill>
                      <button
                        disabled={!item.schema || item.granted || grantingSchemaName === item.schemaName || grantingSchemaName === "all"}
                        onClick={() => item.schema ? void grantRequestedSchema(item.schema) : undefined}
                        type="button"
                      >
                        Grant
                      </button>
                      {item.schema && item.granted ? (
                        <button onClick={() => void togglePermission(item.schema!, false)} type="button">Revoke</button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="chat-panel">
                  <div className="panel-title">Agent Task Console</div>
                  <form className="chat-form" onSubmit={(event) => void runAgentChat(event)}>
                    <input
                      onChange={(event) => setChatInput(event.currentTarget.value)}
                      placeholder="Ask this agent to search or perform a high-risk action..."
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
                  <button onClick={runVaultSearch}><Database size={16} /> Simulate vault.search</button>
                  <button className="danger" onClick={triggerHighRiskAction}><Zap size={16} /> Trigger HITL action</button>
                </div>
              </>
            )}
          </div>

          <div className="panel clearance-panel" id="clearance">
            <div className="panel-title">Access Clearance</div>
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

          <div className="panel vault-panel" id="vault">
            <div className="panel-title">Information Vault</div>
            <form className="vault-search" onSubmit={(event) => void searchVault(event)}>
              <input
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="Search private vault through selected agent..."
                required
                value={searchQuery}
              />
              <select onChange={(event) => setSearchSchemaId(event.currentTarget.value)} value={searchSchemaId}>
                <option value="">All requested schemas</option>
                {schemas.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}
              </select>
              <button disabled={isSearchingVault} type="submit"><Search size={16} /> {isSearchingVault ? "Searching..." : "Search Vault"}</button>
            </form>
            {searchResults.length ? (
              <div className="search-results">
                <strong>Search Results</strong>
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

          <div className="panel audit-panel" id="activity">
            <div className="panel-title">Cryptographic Activity Log</div>
            {logs.slice(0, 8).map((log) => (
              <div className="log-row" key={log.id}>
                <StatusPill tone={log.status === "success" ? "green" : log.status === "pending_human_approval" ? "amber" : "red"}>{log.status}</StatusPill>
                <span>{log.agent?.name ?? "System"} / {log.actionType}</span>
                <small>{log.dataAccessed ?? "no file"} / {log.hash.slice(0, 12)}</small>
              </div>
            ))}
          </div>

          <div className="panel hitl-panel">
            <div className="panel-title">Human Approval Queue</div>
            {hitl.length === 0 ? <p className="empty">No pending high-risk action.</p> : hitl.map((request) => (
              <div className="hitl-row" key={request.id}>
                <strong>{request.agent.name}</strong>
                <span>{request.actionName}</span>
                <div className="button-row">
                  <button onClick={() => void decideHitl(request.id, true)}>Approve</button>
                  <button className="danger" onClick={() => void decideHitl(request.id, false)}>Deny</button>
                </div>
              </div>
            ))}
            <pre>{toolResult}</pre>
          </div>

          <div className="panel settings-panel" id="settings">
            <div className="panel-title">User Settings + Security</div>
            <div className="settings-grid">
              <div><strong>Account</strong><span>{session?.user.email ?? "Local development user"}</span></div>
              <div><strong>Agents</strong><span>{agents.length}</span></div>
              <div><strong>Vault Items</strong><span>{documents.length}</span></div>
              <div><strong>Activity Events</strong><span>{logs.length}</span></div>
            </div>
            <p className="empty">Workspace data is scoped to your signed-in Supabase user and sent to the backend with your session token.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
