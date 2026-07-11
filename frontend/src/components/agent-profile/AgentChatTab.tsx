import type { FormEvent } from "react";
import { KeyRound, MessageSquare, Zap } from "lucide-react";
import type { ActivityLog, Agent, AgentConversation, AgentRunResult, HitlRequest } from "../../api/types";
import { friendlyActionName } from "../../lib/display";
import { externalRuntimeDetail, externalRuntimeSummary } from "../../lib/externalRuntimeDisplay";
import type { AgentProfileTab, ChatTranscriptItem } from "../../hooks/useAgentChat";
import { StatusPill } from "../StatusPill";
import type { HelperPrompt, PermissionReviewItem, ToneState } from "./agentProfileTypes";

type AgentChatTabProps = {
  agentConversation: AgentConversation | null;
  agentRunResult: AgentRunResult | null;
  agentProfileTab: AgentProfileTab;
  allowedPermissionCount: number;
  approvalPlainSentence: (action: string) => string;
  approvalReason: (action: string) => string;
  approvedContinuation: { requestId: string; actionName: string } | null;
  chatInput: string;
  chatTranscript: ChatTranscriptItem[];
  continueApprovedAction: (actionName: string) => void | Promise<void>;
  decideHitl: (requestId: string, approved: boolean) => void | Promise<void>;
  decidingApprovalId: string;
  friendlyDate: (value: string) => string;
  friendlyFallbackReason: (reason?: string) => string;
  friendlyLogText: (log: ActivityLog) => string;
  helperNextStep: string;
  isAgentRunning: boolean;
  isConversationLoading: boolean;
  lastFailedPrompt: string;
  permissionReview: PermissionReviewItem[];
  promptPreview: ToneState;
  readiness: ToneState;
  runAgentChat: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  runSummary: string | null;
  scrollToClearance: () => void;
  selectedAgent: Agent;
  selectedAgentApprovals: HitlRequest[];
  selectedAgentLogs: ActivityLog[];
  selectedReadableInfo: string[];
  selectedRiskyActions: string[];
  setAgentProfileTab: (tab: AgentProfileTab) => void;
  setChatInput: (value: string) => void;
  submitAgentPrompt: (prompt: string) => void | Promise<void>;
  suggestedPrompts: HelperPrompt[];
};

export function AgentChatTab(props: AgentChatTabProps) {
  const {
    agentConversation,
    agentProfileTab,
    agentRunResult,
    allowedPermissionCount,
    approvalPlainSentence,
    approvalReason,
    approvedContinuation,
    chatInput,
    chatTranscript,
    continueApprovedAction,
    decideHitl,
    decidingApprovalId,
    friendlyDate,
    friendlyFallbackReason,
    friendlyLogText,
    helperNextStep,
    isAgentRunning,
    isConversationLoading,
    lastFailedPrompt,
    permissionReview,
    promptPreview,
    readiness,
    runAgentChat,
    runSummary,
    scrollToClearance,
    selectedAgent,
    selectedAgentApprovals,
    selectedAgentLogs,
    selectedReadableInfo,
    selectedRiskyActions,
    setAgentProfileTab,
    setChatInput,
    submitAgentPrompt,
    suggestedPrompts
  } = props;

  return (
    <div className={agentProfileTab === "chat" ? "agent-use-grid" : "agent-use-grid is-tab-hidden"}>
      <section className="chat-panel agent-chat-panel" aria-label="Helper chat">
        <div className="chat-heading">
          <div>
            <strong>Ask {selectedAgent.name}</strong>
            <p>{helperNextStep}</p>
          </div>
          <StatusPill tone={readiness.tone}>{isConversationLoading ? "loading" : readiness.label}</StatusPill>
        </div>
        {agentConversation ? <p className="conversation-note">Conversation: {agentConversation.title}</p> : null}

        {selectedAgentApprovals.length ? (
          <div className="chat-approval-banner" role="status" aria-live="polite">
            <StatusPill tone="amber">Waiting for you</StatusPill>
            <div>
              <strong>Nothing continues unless you allow it</strong>
              <span>{selectedAgentApprovals[0] ? approvalPlainSentence(selectedAgentApprovals[0].actionName) : "A sensitive action is paused."} {selectedAgentApprovals[0] ? approvalReason(selectedAgentApprovals[0].actionName) : "You decide what happens next."}</span>
            </div>
            {selectedAgentApprovals[0] ? (
              <div className="approval-banner-actions">
                <button disabled={decidingApprovalId === selectedAgentApprovals[0].id} onClick={() => void decideHitl(selectedAgentApprovals[0].id, true)} type="button">Allow once</button>
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
              <strong>What do you need?</strong>
              <span>Try one of these, or write your own request.</span>
            </div>
            <StatusPill tone={promptPreview.tone}>{promptPreview.label}</StatusPill>
          </div>
          <div className="suggestion-grid" aria-label="Suggested helper requests">
            {suggestedPrompts.slice(0, 2).map((prompt) => (
              <button className={`suggestion-card ${prompt.tone}`} key={prompt.prompt} onClick={() => setChatInput(prompt.prompt)} type="button">
                <strong>{prompt.label}</strong>
                <span>{prompt.prompt}</span>
                <small>{prompt.detail}</small>
              </button>
            ))}
          </div>
          <div className="send-preview helper-advanced-preview">
            <div><strong>Before It Answers</strong><span>{promptPreview.detail}</span></div>
            <div><strong>Can Read Now</strong><span>{selectedReadableInfo.length ? selectedReadableInfo.join(", ") : "No private info yet"}</span></div>
            <div><strong>Must Ask Before</strong><span>{selectedRiskyActions.length ? selectedRiskyActions.map(friendlyActionName).join(", ") : "No risky actions listed"}</span></div>
          </div>
          <form className="chat-form command-form" onSubmit={(event) => void runAgentChat(event)}>
            <input
              aria-label="Message helper"
              name="helper-message"
              onChange={(event) => setChatInput(event.currentTarget.value)}
              placeholder="Ask what you want help with…"
              value={chatInput}
            />
            <button disabled={isAgentRunning || !chatInput.trim()} type="submit"><MessageSquare size={16} /> {isAgentRunning ? "Thinking…" : "Send"}</button>
          </form>
        </div>

        {chatTranscript.length === 0 && !isConversationLoading ? (
          <div className="chat-empty-state">
            <strong>Ready when you are</strong>
            <span>This helper cannot use saved info or sensitive actions unless you allow it.</span>
          </div>
        ) : null}

        {isConversationLoading ? (
          <div className="chat-loading"><span /><span /><span /></div>
        ) : null}

        {chatTranscript.length ? (
          <div className="chat-transcript">
            {chatTranscript.slice(-8).map((message, index) => {
              const pendingRequest = message.requestId ? selectedAgentApprovals.find((request) => request.id === message.requestId) : undefined;
              const externalSummary = externalRuntimeSummary(message.externalRuntime);
              const externalDetail = externalRuntimeDetail(message.externalRuntime);
              const nextStepText = message.status === "awaiting_human_approval" || message.status === "pending_human_approval"
                ? "Choose Allow once or Deny."
                : message.nextStep;
              return (
                <div className={message.role === "user" ? "chat-bubble chat-user" : "chat-bubble chat-agent"} key={`${message.role}-${message.requestId ?? index}-${message.content.slice(0, 20)}`}>
                  <span>{message.role === "user" ? "You" : selectedAgent.name}</span>
                  <p>{message.content}</p>
                  {message.role === "agent" && externalSummary ? (
                    <div className="external-runtime-note">
                      <strong>{externalSummary}</strong>
                      <span>Ran through AI Agent Hub safety</span>
                      {externalDetail ? <small>{externalDetail}</small> : null}
                    </div>
                  ) : null}
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
                  {nextStepText ? <small>Next: {nextStepText}</small> : null}
                  {message.status === "error" ? <button disabled={!lastFailedPrompt || isAgentRunning} onClick={() => void submitAgentPrompt(lastFailedPrompt)} type="button">Retry</button> : null}
                  {approvedContinuation?.requestId === message.requestId && message.actionName ? (
                    <button disabled={isAgentRunning} onClick={() => void continueApprovedAction(message.actionName!)} type="button">
                      <Zap aria-hidden="true" size={15} /> Continue action
                    </button>
                  ) : null}
                  {pendingRequest && selectedAgentApprovals.length === 0 ? (
                    <div className="approval-card">
                      <StatusPill tone="amber">Waiting for you</StatusPill>
                      <strong>{approvalPlainSentence(pendingRequest.actionName)}</strong>
                      <small>{approvalReason(pendingRequest.actionName)}</small>
                      <small>Nothing continues unless you allow it.</small>
                      <div className="button-row compact-row">
                        <button disabled={decidingApprovalId === pendingRequest.id} onClick={() => void decideHitl(pendingRequest.id, true)} type="button">Allow once</button>
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
                <p>Thinking safely…</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {agentRunResult ? (
          <div className="agent-run-summary">
            <StatusPill tone={agentRunResult.status === "ok" ? "green" : agentRunResult.status === "awaiting_human_approval" ? "amber" : "red"}>
              {agentRunResult.status === "awaiting_human_approval" ? "Waiting for you" : agentRunResult.status}
            </StatusPill>
            <span>{runSummary}</span>
            {agentRunResult.nextStep ? (
              <small>{agentRunResult.status === "awaiting_human_approval" ? "Choose Allow once or Deny." : agentRunResult.nextStep}</small>
            ) : null}
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
          <div><strong>Saved Info</strong><span>{allowedPermissionCount} of {permissionReview.length} allowed</span></div>
          <button onClick={() => setAgentProfileTab("permissions")} type="button"><KeyRound aria-hidden="true" size={15} /> Edit access</button>
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
  );
}
