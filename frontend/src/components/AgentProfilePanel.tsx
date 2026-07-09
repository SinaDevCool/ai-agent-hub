import type { FormEvent } from "react";
import { Database, KeyRound, MessageSquare, Trash2, Zap } from "lucide-react";
import type { ActivityLog, Agent, AgentConversation, AgentRunResult, HitlRequest, VaultDocument, VaultSchema } from "../api/types";
import { friendlyActionName, friendlyCategoryName } from "../lib/display";
import { StatusPill } from "./StatusPill";

type AgentMessageStatus = "success" | "blocked_by_policy" | "pending_human_approval" | "error" | null;

export type ChatTranscriptItem = {
  role: "user" | "agent";
  content: string;
  status?: AgentRunResult["status"] | AgentMessageStatus;
  requestId?: string;
  actionName?: string;
  provider?: AgentRunResult["provider"];
  model?: string;
  providerFallbackReason?: AgentRunResult["providerFallbackReason"];
  runtimeState?: AgentRunResult["runtimeState"];
  nextStep?: string;
  usedSchemas?: string[];
  documents?: VaultDocument[];
};

export type AgentProfileTab = "chat" | "permissions" | "activity" | "settings";

type HelperPrompt = {
  label: string;
  prompt: string;
  detail: string;
  tone: "info" | "safe" | "approval";
};

type PermissionReviewItem = {
  schema?: VaultSchema;
  schemaName: string;
  granted: boolean;
};

type ToneState = {
  tone: "blue" | "amber" | "green" | "red";
  label: string;
  detail: string;
};

type AgentProfilePanelProps = {
  className: string;
  selectedAgent: Agent;
  readiness: ToneState;
  selectedHelperToolsLabel: string;
  selectedReadableInfoLabel: string;
  selectedRiskyActionsLabel: string;
  selectedCannotDoLabel: string;
  agentProfileTab: AgentProfileTab;
  setAgentProfileTab: (tab: AgentProfileTab) => void;
  isConversationLoading: boolean;
  agentConversation: AgentConversation | null;
  selectedAgentApprovals: HitlRequest[];
  decidingApprovalId: string;
  decideHitl: (requestId: string, approved: boolean) => void | Promise<void>;
  approvalPlainSentence: (action: string) => string;
  approvalReason: (action: string) => string;
  scrollToClearance: () => void;
  helperNextStep: string;
  promptPreview: ToneState;
  suggestedPrompts: HelperPrompt[];
  setChatInput: (value: string) => void;
  selectedReadableInfo: string[];
  selectedRiskyActions: string[];
  chatInput: string;
  isAgentRunning: boolean;
  runAgentChat: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  chatTranscript: ChatTranscriptItem[];
  lastFailedPrompt: string;
  submitAgentPrompt: (prompt: string) => void | Promise<void>;
  approvedContinuation: { requestId: string; actionName: string } | null;
  continueApprovedAction: (actionName: string) => void | Promise<void>;
  friendlyFallbackReason: (reason?: string) => string;
  agentRunResult: AgentRunResult | null;
  runSummary: string | null;
  allowedPermissionCount: number;
  permissionReview: PermissionReviewItem[];
  selectedAgentLogs: ActivityLog[];
  friendlyLogText: (log: ActivityLog) => string;
  friendlyLogDetail: (log: ActivityLog) => string;
  friendlyDate: (value: string) => string;
  ungrantedRequestedSchemas: PermissionReviewItem[];
  grantingSchemaName: string;
  grantAllRequestedSchemas: () => void | Promise<void>;
  grantRequestedSchema: (schema: VaultSchema) => void | Promise<void>;
  togglePermission: (schema: VaultSchema, enabled: boolean) => void | Promise<void>;
  friendlyTrustLabel: (score: number) => string;
  runVaultSearch: () => void | Promise<void>;
  triggerHighRiskAction: () => void | Promise<void>;
  revokeSelectedAgentAccess: () => void | Promise<void>;
  removeAgentFromProfile: (agent: Agent) => void;
};

export function AgentProfilePanel(props: AgentProfilePanelProps) {
  const {
    className,
    selectedAgent,
    readiness,
    selectedHelperToolsLabel,
    selectedReadableInfoLabel,
    selectedRiskyActionsLabel,
    selectedCannotDoLabel,
    agentProfileTab,
    setAgentProfileTab,
    isConversationLoading,
    agentConversation,
    selectedAgentApprovals,
    decidingApprovalId,
    decideHitl,
    approvalPlainSentence,
    approvalReason,
    scrollToClearance,
    helperNextStep,
    promptPreview,
    suggestedPrompts,
    setChatInput,
    selectedReadableInfo,
    selectedRiskyActions,
    chatInput,
    isAgentRunning,
    runAgentChat,
    chatTranscript,
    lastFailedPrompt,
    submitAgentPrompt,
    approvedContinuation,
    continueApprovedAction,
    friendlyFallbackReason,
    agentRunResult,
    runSummary,
    allowedPermissionCount,
    permissionReview,
    selectedAgentLogs,
    friendlyLogText,
    friendlyLogDetail,
    friendlyDate,
    ungrantedRequestedSchemas,
    grantingSchemaName,
    grantAllRequestedSchemas,
    grantRequestedSchema,
    togglePermission,
    friendlyTrustLabel,
    runVaultSearch,
    triggerHighRiskAction,
    revokeSelectedAgentAccess,
    removeAgentFromProfile
  } = props;

  return (
    <div className={className}>
      <div className="agent-use-shell">
        <div className="agent-use-header">
          <div>
            <div className="panel-title">Use This Helper</div>
            <h2>{selectedAgent.name}</h2>
            <p>{selectedAgent.capabilityManifest.description}</p>
          </div>
          <StatusPill tone={readiness.tone}>{readiness.label}</StatusPill>
        </div>
        <div className="agent-simple-summary" aria-label={`${selectedAgent.name} safety summary`}>
          <div><strong>Can help with</strong><span>{selectedHelperToolsLabel}</span></div>
          <div><strong>Can read</strong><span>{selectedReadableInfoLabel}</span></div>
          <div><strong>Must ask before</strong><span>{selectedRiskyActionsLabel}</span></div>
          <div><strong>Blocked until you allow</strong><span>{selectedCannotDoLabel}</span></div>
        </div>

        <div className="agent-profile-tabs" role="tablist" aria-label={`${selectedAgent.name} workspace`}>
          {([
            ["chat", "Chat"],
            ["permissions", "Permissions"],
            ["activity", "Receipts"],
            ["settings", "Settings"]
          ] as Array<[AgentProfileTab, string]>).map(([tab, label]) => (
            <button
              aria-selected={agentProfileTab === tab}
              className={agentProfileTab === tab ? "active" : ""}
              key={tab}
              onClick={() => setAgentProfileTab(tab)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <div className={agentProfileTab === "chat" ? "agent-use-grid" : "agent-use-grid is-tab-hidden"}>
          <section className="chat-panel agent-chat-panel" aria-label="Agent chat">
            <div className="chat-heading">
              <div>
                <strong>Talk to {selectedAgent.name}</strong>
                <p>{readiness.detail}</p>
              </div>
              <StatusPill tone="blue">{isConversationLoading ? "loading" : "saved"}</StatusPill>
            </div>
            {agentConversation ? <p className="conversation-note">Conversation: {agentConversation.title}</p> : null}

            {selectedAgentApprovals.length ? (
              <div className="chat-approval-banner" role="status" aria-live="polite">
                <StatusPill tone="amber">{selectedAgentApprovals.length} waiting</StatusPill>
                <div>
                  <strong>Approval needed before this helper continues</strong>
                  <span>{selectedAgentApprovals[0] ? approvalPlainSentence(selectedAgentApprovals[0].actionName) : "A sensitive action is paused."} {selectedAgentApprovals[0] ? approvalReason(selectedAgentApprovals[0].actionName) : "You decide what happens next."}</span>
                </div>
                {selectedAgentApprovals[0] ? (
                  <div className="approval-banner-actions">
                    <button disabled={decidingApprovalId === selectedAgentApprovals[0].id} onClick={() => void decideHitl(selectedAgentApprovals[0].id, true)} type="button">Approve</button>
                    <button className="danger" disabled={decidingApprovalId === selectedAgentApprovals[0].id} onClick={() => void decideHitl(selectedAgentApprovals[0].id, false)} type="button">Deny</button>
                  </div>
                ) : (
                  <button onClick={scrollToClearance} type="button">Review</button>
                )}
              </div>
            ) : null}

            <div className="chat-command-center">
              <div className="composer-heading">
                <div>
                  <strong>What do you want help with?</strong>
                  <span>{helperNextStep}</span>
                </div>
                <StatusPill tone={promptPreview.tone}>{promptPreview.label}</StatusPill>
              </div>
              <div className="suggestion-grid" aria-label="Suggested helper requests">
                {suggestedPrompts.map((prompt) => (
                  <button className={`suggestion-card ${prompt.tone}`} key={prompt.prompt} onClick={() => setChatInput(prompt.prompt)} type="button">
                    <strong>{prompt.label}</strong>
                    <span>{prompt.prompt}</span>
                    <small>{prompt.detail}</small>
                  </button>
                ))}
              </div>
              <div className="send-preview">
                <div><strong>Before it answers</strong><span>{promptPreview.detail}</span></div>
                <div><strong>Can read now</strong><span>{selectedReadableInfo.length ? selectedReadableInfo.join(", ") : "No private info yet"}</span></div>
                <div><strong>Must ask before</strong><span>{selectedRiskyActions.length ? selectedRiskyActions.map(friendlyActionName).join(", ") : "No risky actions listed"}</span></div>
              </div>
              <form className="chat-form command-form" onSubmit={(event) => void runAgentChat(event)}>
                <input
                  aria-label="Message helper"
                  name="helper-message"
                  onChange={(event) => setChatInput(event.currentTarget.value)}
                  placeholder="Ask it to find info or try an action that may need approval..."
                  value={chatInput}
                />
                <button disabled={isAgentRunning || !chatInput.trim()} type="submit"><MessageSquare size={16} /> {isAgentRunning ? "Thinking..." : "Send"}</button>
              </form>
            </div>

            {chatTranscript.length === 0 && !isConversationLoading ? (
              <div className="chat-empty-state">
                <strong>Start with a safe request</strong>
                <span>Try one of the cards above. This helper will show a receipt when it reads private info and pause before sensitive actions.</span>
              </div>
            ) : null}

            {isConversationLoading ? (
              <div className="chat-loading"><span /><span /><span /></div>
            ) : null}

            {chatTranscript.length ? (
              <div className="chat-transcript">
                {chatTranscript.slice(-8).map((message, index) => {
                  const pendingRequest = message.requestId ? selectedAgentApprovals.find((request) => request.id === message.requestId) : undefined;
                  return (
                    <div className={message.role === "user" ? "chat-bubble chat-user" : "chat-bubble chat-agent"} key={`${message.role}-${message.requestId ?? index}-${message.content.slice(0, 20)}`}>
                      <span>{message.role === "user" ? "You" : selectedAgent.name}</span>
                      <p>{message.content}</p>
                      {message.provider ? (
                        <small>
                          {message.provider === "openai"
                            ? `OpenAI answer${message.model ? ` (${message.model})` : ""}`
                            : `Built-in safe answer service. ${friendlyFallbackReason(message.providerFallbackReason)}`}
                        </small>
                      ) : null}
                      {message.role === "agent" && message.usedSchemas?.length ? (
                        <div className="info-receipt">
                          <strong>Private info used</strong>
                          <span>{message.usedSchemas.join(", ")}</span>
                          {message.documents?.length ? <small>Sources: {message.documents.map((document) => document.title).join(", ")}</small> : null}
                        </div>
                      ) : null}
                      {message.role === "agent" && !message.usedSchemas?.length && message.status === "success" ? <small>No private info was used for this answer.</small> : null}
                      {message.nextStep ? <small>Next: {message.nextStep}</small> : null}
                      {message.status === "error" ? <button disabled={!lastFailedPrompt || isAgentRunning} onClick={() => void submitAgentPrompt(lastFailedPrompt)} type="button">Retry</button> : null}
                      {approvedContinuation?.requestId === message.requestId && message.actionName ? (
                        <button disabled={isAgentRunning} onClick={() => void continueApprovedAction(message.actionName!)} type="button">
                          <Zap size={15} /> Continue approved action
                        </button>
                      ) : null}
                      {pendingRequest ? (
                        <div className="approval-card">
                          <StatusPill tone="amber">approval needed</StatusPill>
                          <strong>{approvalPlainSentence(pendingRequest.actionName)}</strong>
                          <small>{approvalReason(pendingRequest.actionName)}</small>
                          <small>You are still in control. Deny it if anything feels wrong.</small>
                          <div className="button-row compact-row">
                            <button disabled={decidingApprovalId === pendingRequest.id} onClick={() => void decideHitl(pendingRequest.id, true)} type="button">Approve</button>
                            <button className="danger" disabled={decidingApprovalId === pendingRequest.id} onClick={() => void decideHitl(pendingRequest.id, false)} type="button">Deny</button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {isAgentRunning ? (
                  <div className="chat-bubble chat-agent thinking-bubble">
                    <span>{selectedAgent.name}</span>
                    <p>Thinking safely...</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {agentRunResult ? (
              <div className="agent-run-summary">
                <StatusPill tone={agentRunResult.status === "ok" ? "green" : agentRunResult.status === "awaiting_human_approval" ? "amber" : "red"}>
                  {agentRunResult.status === "awaiting_human_approval" ? "needs approval" : agentRunResult.status}
                </StatusPill>
                <span>{runSummary}</span>
                {agentRunResult.nextStep ? <small>{agentRunResult.nextStep}</small> : null}
                {agentRunResult.usedSchemas?.length ? <small>Used: {agentRunResult.usedSchemas.join(", ")}</small> : null}
              </div>
            ) : null}
          </section>

          <aside className="agent-side-panel">
            <div className="agent-status-card">
              <StatusPill tone={readiness.tone}>{readiness.label}</StatusPill>
              <strong>{readiness.detail}</strong>
              <small>{helperNextStep}</small>
            </div>
            <div className="side-permission-summary">
              <div><strong>Private info access</strong><span>{allowedPermissionCount} of {permissionReview.length} allowed</span></div>
              <button onClick={() => setAgentProfileTab("permissions")} type="button"><KeyRound size={15} /> Edit access</button>
            </div>
            <div className="agent-activity-card">
              <strong>Recent activity</strong>
              {selectedAgentLogs.length ? selectedAgentLogs.slice(0, 3).map((log) => (
                <div className="mini-log-row" key={log.id}>
                  <StatusPill tone={log.status === "success" ? "green" : log.status === "pending_human_approval" ? "amber" : "red"}>{log.status.replace(/_/g, " ")}</StatusPill>
                  <span>{friendlyLogText(log)}</span>
                  <small>{friendlyDate(log.createdAt)}</small>
                </div>
              )) : <small>No activity for this helper yet.</small>}
            </div>
          </aside>
        </div>

        {agentProfileTab === "permissions" ? (
          <section className="agent-tab-panel" aria-label="Agent permissions">
            <div className="permission-review-header">
              <div><strong>Private info this helper can use</strong><span>{allowedPermissionCount} of {permissionReview.length} requested categories allowed</span></div>
              <button disabled={ungrantedRequestedSchemas.length === 0 || grantingSchemaName === "all"} onClick={() => void grantAllRequestedSchemas()} type="button">
                <KeyRound size={16} /> Allow requested info
              </button>
            </div>
            {permissionReview.length === 0 ? (
              <p className="empty">This helper has not requested private info.</p>
            ) : permissionReview.map((item) => (
              <div className="permission-review-row" key={item.schemaName}>
                <div>
                  <strong>{item.schemaName}</strong>
                  <small>{item.schema?.description ?? "Unknown info category"}</small>
                </div>
                <StatusPill tone={item.granted ? "green" : item.schema ? "amber" : "red"}>{item.granted ? "allowed" : item.schema ? "needed" : "missing"}</StatusPill>
                {item.schema && item.granted ? (
                  <button onClick={() => void togglePermission(item.schema!, false)} type="button">Revoke</button>
                ) : (
                  <button disabled={!item.schema || grantingSchemaName === item.schemaName || grantingSchemaName === "all"} onClick={() => item.schema ? void grantRequestedSchema(item.schema) : undefined} type="button">
                    Allow
                  </button>
                )}
              </div>
            ))}
          </section>
        ) : null}

        {agentProfileTab === "activity" ? (
          <section className="agent-tab-panel" aria-label="Agent activity">
            <div className="panel-heading-row">
              <div>
                <strong>Receipts for this helper</strong>
                <p className="mobile-section-intro">Every read, approval, and block appears here.</p>
              </div>
              <StatusPill tone="blue">{selectedAgentLogs.length} events</StatusPill>
            </div>
            <div className="agent-activity-list">
              {selectedAgentLogs.length ? selectedAgentLogs.map((log) => (
                <div className="log-row" key={log.id}>
                  <StatusPill tone={log.status === "success" ? "green" : log.status === "pending_human_approval" ? "amber" : "red"}>{log.status.replace(/_/g, " ")}</StatusPill>
                  <strong>{friendlyLogText(log)}</strong>
                  <small>{friendlyLogDetail(log)}</small>
                  <small>{friendlyDate(log.createdAt)}</small>
                </div>
              )) : <p className="empty">No activity for this helper yet.</p>}
            </div>
          </section>
        ) : null}

        {agentProfileTab === "settings" ? (
          <section className="agent-tab-panel" aria-label="Agent settings">
            <div className="manifest-grid">
              <div><strong>Category</strong><span>{friendlyCategoryName(selectedAgent.category)}</span></div>
              <div><strong>Trust</strong><span>{friendlyTrustLabel(selectedAgent.trustScore)} / {selectedAgent.trustScore}</span></div>
              <div><strong>Control</strong><span>Can only use what you allow</span></div>
            </div>
            <div className="button-row">
              <button onClick={() => setAgentProfileTab("chat")} type="button"><MessageSquare size={16} /> Open chat</button>
              <button onClick={() => void runVaultSearch()} type="button"><Database size={16} /> Search personal info</button>
              <button onClick={() => void triggerHighRiskAction()} type="button"><Zap size={16} /> Try approval flow</button>
              <button onClick={() => void revokeSelectedAgentAccess()} type="button"><KeyRound size={16} /> Revoke all access</button>
              <button className="danger" onClick={() => removeAgentFromProfile(selectedAgent)} type="button"><Trash2 size={16} /> Remove helper</button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
