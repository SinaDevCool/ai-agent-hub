import { Clipboard, Download, KeyRound, Link2, LogOut, Pencil, Play, ShieldOff, Trash2, Unplug, Workflow } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Agent, ConnectedAccount, CreatorAccessRequest, WorkflowProvider } from "../api/types";
import type { useWorkflows } from "../hooks/useWorkflows";

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function copyText(value: string) {
  void navigator.clipboard?.writeText(value);
}

export function SettingsPanel(props: {
  activityCount: number;
  canUseCreatorTools: boolean;
  className: string;
  creatorAccessError: string;
  creatorAccessReason: string;
  creatorAccessRequest: CreatorAccessRequest | null;
  connectedAccounts: ConnectedAccount[];
  connectorError: string;
  connectorMessage: string;
  agentCount: number;
  isConnectorSaving: boolean;
  isCreatorAccessSaving: boolean;
  onConnectGoogle: () => void | Promise<void>;
  onDisconnectConnector: (accountId: string) => void | Promise<void>;
  onExportData: () => void;
  onManageAccess: () => void;
  onOpenCreator: () => void;
  onCreatorAccessReasonChange: (reason: string) => void;
  onRequestCreatorAccess: () => Promise<CreatorAccessRequest | null>;
  onRevokeAllAccess: () => void;
  onSignOut?: () => void;
  privateInfoCount: number;
  userEmail: string;
  visibleAgents: Agent[];
  workflows: ReturnType<typeof useWorkflows>;
}) {
  const [exportNotice, setExportNotice] = useState("");
  const [creatorValidation, setCreatorValidation] = useState("");
  const [workflowDraft, setWorkflowDraft] = useState({
    name: "",
    provider: "n8n" as WorkflowProvider,
    capabilityKey: "general.research",
    description: "",
    endpointUrl: "",
    agentId: ""
  });
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  function submitCreatorRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanReason = props.creatorAccessReason.trim();
    if (cleanReason.length < 12) {
      setCreatorValidation("Tell us what kind of agents you want to publish.");
      return;
    }
    setCreatorValidation("");
    void props.onRequestCreatorAccess();
  }

  function exportData() {
    props.onExportData();
    setExportNotice("Your data export was prepared.");
  }

  function submitWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void props.workflows.createWorkflow({
      name: workflowDraft.name,
      provider: workflowDraft.provider,
      capabilityKey: workflowDraft.capabilityKey,
      description: workflowDraft.description,
      endpointUrl: workflowDraft.endpointUrl,
      agentId: workflowDraft.agentId || null,
      toolName: "workflow.run"
    }).then((workflow) => {
      if (!workflow) return;
      setWorkflowDraft({
        name: "",
        provider: workflowDraft.provider,
        capabilityKey: workflowDraft.capabilityKey,
        description: "",
        endpointUrl: "",
        agentId: ""
      });
    });
  }

  const showCreatorRequestForm = !props.canUseCreatorTools && props.creatorAccessRequest?.status !== "pending";
  const googleAccount = props.connectedAccounts.find((account) => account.provider === "google" && account.status === "active");
  const selectedCapability = props.workflows.capabilities.find((capability) => capability.key === workflowDraft.capabilityKey)
    ?? props.workflows.capabilities.find((capability) => capability.key === "general.research");
  const workflowStatusLabel = {
    active: "active",
    draft: "needs test",
    failed: "needs fix",
    disabled: "disabled"
  };

  return (
    <div className={props.className} id="settings">
      <div className="panel-heading-row settings-heading-row">
        <div>
          <div className="panel-title">Account controls</div>
          <p className="mobile-section-intro">Manage your account, saved info access, and data export.</p>
        </div>
      </div>

      <div className="settings-grid">
        <div><strong>Agents</strong><span>{props.agentCount}</span></div>
        <div><strong>Saved info</strong><span>{props.privateInfoCount}</span></div>
        <div><strong>Activity</strong><span>{props.activityCount}</span></div>
        <div><strong>Account</strong><span>{props.userEmail}</span></div>
      </div>

      <section className="settings-consumer-card">
        <div>
          <strong>Privacy & data</strong>
          <span>Control what agents can read and keep a copy of your workspace data.</span>
        </div>
        <div className="settings-primary-actions" aria-label="Privacy and data actions">
          <button className="primary-action" onClick={props.onManageAccess} type="button"><KeyRound size={16} /> Manage access</button>
          <button onClick={exportData} type="button"><Download size={16} /> Export my data</button>
        </div>
        {exportNotice ? <small className="settings-action-note" role="status" aria-live="polite">{exportNotice}</small> : null}
      </section>

      <section className="settings-connector-card">
        <div>
          <strong>Connected accounts</strong>
          <span>Connect services your agents can use. Agents still need your approval before using private info or taking sensitive actions.</span>
        </div>
        <div className="connector-row">
          <div>
            <strong>Google</strong>
            <span>{googleAccount ? `${googleAccount.accountLabel} connected` : "Connect Gmail drafts and Calendar read access"}</span>
          </div>
          {googleAccount ? (
            <button disabled={props.isConnectorSaving} onClick={() => void props.onDisconnectConnector(googleAccount.id)} type="button">
              <Unplug size={16} /> Disconnect
            </button>
          ) : (
            <button disabled={props.isConnectorSaving} onClick={() => void props.onConnectGoogle()} type="button">
              <Link2 size={16} /> {props.isConnectorSaving ? "Opening…" : "Connect Google"}
            </button>
          )}
        </div>
        {props.connectorMessage ? <small className="settings-action-note" role="status" aria-live="polite">{props.connectorMessage}</small> : null}
        {props.connectorError ? <small className="form-error">{props.connectorError}</small> : null}
      </section>

      <section className="settings-consumer-card danger-zone">
        <div>
          <strong>Safety</strong>
          <span>Remove every agent's saved-info access if you want to reset permissions. Agents stop using saved info until you allow access again.</span>
        </div>
        <button onClick={props.onRevokeAllAccess} type="button"><ShieldOff size={16} /> Remove all agent access</button>
      </section>

      <div className="settings-section-grid">
        {props.canUseCreatorTools ? <section>
          <strong>Creator tools available</strong>
          <span>Create and publish agents when you want to supply the marketplace.</span>
          <button onClick={props.onOpenCreator} type="button"><Pencil size={16} /> Open Creator Studio</button>
        </section> : (
          <section className="creator-access-card">
            <strong>Want to publish agents?</strong>
            {props.creatorAccessRequest?.status === "pending" ? (
              <span>Creator request pending. We will unlock publishing after marketplace review.</span>
            ) : props.creatorAccessRequest?.status === "denied" ? (
              <span>{props.creatorAccessRequest.reviewNote || "Your last request needs more detail before creator tools can be enabled."}</span>
            ) : (
              <span>Request creator access when you are ready.</span>
            )}
            {creatorValidation ? <small className="form-error">{creatorValidation}</small> : null}
            {props.creatorAccessError ? <small className="form-error">{props.creatorAccessError}</small> : null}
            {showCreatorRequestForm ? (
              <form className="creator-access-form" noValidate onSubmit={submitCreatorRequest}>
                <label htmlFor="creator-access-reason">
                  <span>What do you want to publish?</span>
                  <textarea
                    autoComplete="off"
                    id="creator-access-reason"
                    maxLength={800}
                    name="creator-access-reason"
                    onChange={(event) => {
                      if (creatorValidation) setCreatorValidation("");
                      props.onCreatorAccessReasonChange(event.currentTarget.value);
                    }}
                    placeholder="Example: travel agents that plan trips and ask before booking."
                    rows={3}
                    value={props.creatorAccessReason}
                  />
                </label>
                <button disabled={props.isCreatorAccessSaving} type="submit">
                  <Pencil size={16} /> {props.isCreatorAccessSaving ? "Requesting…" : "Request creator access"}
                </button>
              </form>
            ) : null}
          </section>
        )}
        <section>
          <strong>Privacy note</strong>
          <span>Agents start restricted. If you remove all access, they stop using saved info until you allow access again.</span>
        </section>
      </div>

      <section className="settings-advanced-card">
        <div className="settings-advanced-heading">
          <div>
            <strong>Connected automations</strong>
            <span>Connect outside automations for agents that need to search, compare, book, draft, or update data in other tools.</span>
          </div>
          <button aria-expanded={isAdvancedOpen} onClick={() => setIsAdvancedOpen((current) => !current)} type="button">
            {isAdvancedOpen ? "Hide connected automations" : "Show connected automations"}
          </button>
        </div>

        {isAdvancedOpen ? (
          <div className="settings-advanced-body">
            <section className="settings-connector-card workflow-card">
              <div>
                <strong>Connected automations</strong>
                <span>Use n8n, Make, Zapier, or a custom webhook when an agent needs outside automation.</span>
              </div>
              <form className="workflow-form" onSubmit={submitWorkflow}>
                <label>
                  <span>Name</span>
                  <input
                    maxLength={120}
                    name="automation-name"
                    onChange={(event) => setWorkflowDraft((current) => ({ ...current, name: event.currentTarget.value }))}
                    placeholder="Travel search automation"
                    required
                    value={workflowDraft.name}
                  />
                </label>
                <label>
                  <span>Tool</span>
                  <select
                    name="automation-provider"
                    onChange={(event) => setWorkflowDraft((current) => ({ ...current, provider: event.currentTarget.value as WorkflowProvider }))}
                    value={workflowDraft.provider}
                  >
                    <option value="n8n">n8n</option>
                    <option value="make">Make</option>
                    <option value="zapier">Zapier</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <label className="workflow-form-wide">
                  <span>What can this automation do?</span>
                  <select
                    name="automation-capability"
                    onChange={(event) => setWorkflowDraft((current) => ({ ...current, capabilityKey: event.currentTarget.value }))}
                    value={workflowDraft.capabilityKey}
                  >
                    {props.workflows.capabilities.map((capability) => (
                      <option key={capability.key} value={capability.key}>{capability.category}: {capability.label}</option>
                    ))}
                    {props.workflows.capabilities.length === 0 ? <option value="general.research">Daily Tasks: Research online</option> : null}
                  </select>
                </label>
                <label className="workflow-form-wide">
                  <span>Description</span>
                  <input
                    maxLength={280}
                    name="automation-description"
                    onChange={(event) => setWorkflowDraft((current) => ({ ...current, description: event.currentTarget.value }))}
                    placeholder="Searches hotels across booking sources"
                    value={workflowDraft.description}
                  />
                </label>
                <label className="workflow-form-wide">
                  <span>Webhook URL</span>
                  <input
                    name="automation-webhook-url"
                    onChange={(event) => setWorkflowDraft((current) => ({ ...current, endpointUrl: event.currentTarget.value }))}
                    placeholder="https://example.com/agent-webhook"
                    required
                    type="url"
                    value={workflowDraft.endpointUrl}
                  />
                </label>
                <label>
                  <span>Agent</span>
                  <select
                    name="automation-agent"
                    onChange={(event) => setWorkflowDraft((current) => ({ ...current, agentId: event.currentTarget.value }))}
                    value={workflowDraft.agentId}
                  >
                    <option value="">Any agent using workflow.run</option>
                    {props.visibleAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </select>
                </label>
                <button disabled={props.workflows.isSaving} type="submit">
                  <Workflow size={16} /> {props.workflows.isSaving ? "Saving…" : "Add automation"}
                </button>
              </form>

              {selectedCapability ? (
                <div className="workflow-contract-panel">
                  <div className="workflow-contract-heading">
                    <div>
                      <strong>{selectedCapability.label} technical format</strong>
                      <span>{selectedCapability.description}</span>
                    </div>
                    <span className="status-pill blue">{selectedCapability.category}</span>
                  </div>
                  <div className="workflow-contract-grid">
                    <div>
                      <div className="contract-title-row">
                        <strong>Automation input</strong>
                        <button onClick={() => copyText(formatJson(selectedCapability.contract.receives))} type="button"><Clipboard size={14} /> Copy</button>
                      </div>
                      <pre>{formatJson(selectedCapability.contract.receives)}</pre>
                    </div>
                    <div>
                      <div className="contract-title-row">
                        <strong>Automation result</strong>
                        <button onClick={() => copyText(formatJson(selectedCapability.contract.returns))} type="button"><Clipboard size={14} /> Copy</button>
                      </div>
                      <pre>{formatJson(selectedCapability.contract.returns)}</pre>
                    </div>
                  </div>
                  <div className="workflow-contract-fields">
                    <div><strong>Required</strong><span>{selectedCapability.contract.requiredFields.join(", ")}</span></div>
                    <div><strong>Optional</strong><span>{selectedCapability.contract.optionalFields.join(", ")}</span></div>
                    <div><strong>Tips</strong><span>{selectedCapability.contract.tips.join(" ")}</span></div>
                  </div>
                </div>
              ) : null}

              {props.workflows.lastSigningSecret ? (
                <div className="workflow-secret-note">
                  <strong>Signing secret</strong>
                  <code>{props.workflows.lastSigningSecret}</code>
                  <span>Add this secret to your automation tool now. It is shown only once.</span>
                </div>
              ) : null}

              <div className="workflow-list">
                {props.workflows.workflows.length === 0 ? (
                  <div className="workflow-empty">
                    <strong>No automations connected yet</strong>
                    <span>Add one when an agent needs to search, compare, book, draft, or update something outside this hub.</span>
                  </div>
                ) : props.workflows.workflows.map((workflow) => {
                  const agent = props.visibleAgents.find((item) => item.id === workflow.agentId);
                  return (
                    <div className="workflow-row" key={workflow.id}>
                      <div>
                        <strong>{workflow.name}</strong>
                        <span>{workflow.capability?.label ?? workflow.capabilityKey}</span>
                        {workflow.description ? <small>{workflow.description}</small> : null}
                        <span>{workflow.provider} · {agent?.name ?? "Any agent"} · {new URL(workflow.endpointUrl).hostname}</span>
                        {workflow.lastFailureReason ? <small>{workflow.lastFailureReason}</small> : null}
                      </div>
                      <span className={`status-pill ${workflow.status === "active" ? "green" : workflow.status === "failed" ? "red" : workflow.status === "disabled" ? "amber" : "blue"}`}>
                        {workflowStatusLabel[workflow.status]}
                      </span>
                      <div className="workflow-actions">
                        <button disabled={props.workflows.isSaving} onClick={() => void props.workflows.testWorkflow(workflow.id)} type="button">
                          <Play size={16} /> Test
                        </button>
                        <button
                          disabled={props.workflows.isSaving}
                          onClick={() => void props.workflows.setWorkflowStatus(workflow.id, workflow.status === "disabled" ? "active" : "disabled")}
                          type="button"
                        >
                          {workflow.status === "disabled" ? "Enable" : "Disable"}
                        </button>
                        <button className="danger" disabled={props.workflows.isSaving} onClick={() => void props.workflows.deleteWorkflow(workflow.id)} type="button">
                          <Trash2 size={16} /> Remove
                        </button>
                      </div>
                      {props.workflows.lastTestPreview?.workflowId === workflow.id ? (
                        <div className={`workflow-test-preview ${props.workflows.lastTestPreview.result?.quality ?? "malformed"}`}>
                          <strong>{props.workflows.lastTestPreview.result ? props.workflows.lastTestPreview.result.title : "Test needs attention"}</strong>
                          <span>{props.workflows.lastTestPreview.result ? props.workflows.lastTestPreview.result.summary : props.workflows.lastTestPreview.reason}</span>
                          {props.workflows.lastTestPreview.result ? (
                            <small>Result quality: {props.workflows.lastTestPreview.result.quality}. {props.workflows.lastTestPreview.result.items.length} item{props.workflows.lastTestPreview.result.items.length === 1 ? "" : "s"} returned.</small>
                          ) : <small>Check the webhook URL, signing secret, and returned JSON shape.</small>}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {props.workflows.message ? <small>{props.workflows.message}</small> : null}
              {props.workflows.error ? <small className="form-error">{props.workflows.error}</small> : null}
            </section>
          </div>
        ) : null}
      </section>

      <div className="privacy-actions">
        {props.onSignOut ? <button onClick={props.onSignOut} type="button"><LogOut size={16} /> Sign out</button> : null}
      </div>
      <p className="empty">Your workspace data is scoped to your signed-in account.</p>
    </div>
  );
}
