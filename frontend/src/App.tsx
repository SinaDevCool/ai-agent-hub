import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Activity, Bot, Database, FileSearch, KeyRound, LogOut, Mail, Radio, ShieldCheck, Zap } from "lucide-react";
import { apiGet, apiPost, setApiAccessToken } from "./api/client";
import { isAuthConfigured, supabase, type AuthSession } from "./api/supabaseClient";
import type { ActivityLog, Agent, HitlRequest, VaultDocument, VaultSchema } from "./api/types";
import { StatusPill } from "./components/StatusPill";

type RealtimeEvent = { type: string; payload: unknown };
type SectionId = "agents" | "vault" | "clearance" | "activity";
type AgentDraft = {
  name: string;
  category: string;
  apiProtocol: string;
  description: string;
  tools: string[];
  requestedSchemas: string[];
  highRiskActionsText: string;
};

const navItems: Array<{ id: SectionId; label: string; icon: typeof Bot }> = [
  { id: "agents", label: "Agents", icon: Bot },
  { id: "vault", label: "Information Vault", icon: Database },
  { id: "clearance", label: "Access Clearance", icon: KeyRound },
  { id: "activity", label: "Activity Log", icon: Activity }
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
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
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
                  </div>
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
                    </div>
                  ))}
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
            {documents.map((document) => (
              <article className="doc-row" key={document.id}>
                <strong>{document.title}</strong>
                <span>{document.relativePath}</span>
                <p>{document.excerpt}</p>
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
        </section>
      </section>
    </main>
  );
}
