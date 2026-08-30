import type { FormEvent } from "react";
import { ExternalLink, MessageSquare, RotateCw, Zap } from "lucide-react";
import type { Agent, AgentConversation, AgentRunResult, HitlRequest, ProviderReceipt, WorkflowResultCard as WorkflowResultCardType } from "../../api/types";
import { providerReceiptBadge, providerReceiptDetail, providerReceiptTitle, providerReceiptTone } from "../../lib/appText";
import { friendlyActionName } from "../../lib/display";
import { externalRuntimeDetail, externalRuntimeSummary } from "../../lib/externalRuntimeDisplay";
import type { AgentProfileTab, ChatTranscriptItem } from "../../hooks/useAgentChat";
import { StatusPill } from "../StatusPill";
import type { HelperPrompt, PermissionReviewItem, ToneState } from "./agentProfileTypes";

function localModelLabel(model?: string) {
  if (model === "ministral-3-3b-q4") return "Ministral 3 3B · fast local route";
  if (model === "ministral-3-8b-q4") return "Ministral 3 8B · quality local route";
  return model?.replace(/-/g, " ") ?? "Local model";
}

function WorkflowResultCard(props: {
  result: WorkflowResultCardType;
  isAgentRunning: boolean;
  lastFailedPrompt: string;
  submitAgentPrompt: (prompt: string) => void | Promise<void>;
}) {
  const { result, isAgentRunning, lastFailedPrompt, submitAgentPrompt } = props;
  const visibleItems = result.items.slice(0, 4);
  return (
    <div className={`workflow-result-card ${result.status === "failed" ? "is-failed" : ""}`}>
      <div className="workflow-result-heading">
        <StatusPill tone={result.status === "failed" ? "red" : "green"}>{result.status === "failed" ? "Needs attention" : result.receipt.capabilityLabel}</StatusPill>
        <div>
          <strong>{result.title}</strong>
          <span>{result.summary}</span>
        </div>
      </div>
      {visibleItems.length ? (
        <div className="workflow-result-list">
          {visibleItems.map((item, index) => (
            <div className="workflow-result-item" key={`${item.title}-${index}`}>
              <div>
                <strong>{item.title}</strong>
                {item.subtitle ? <span>{item.subtitle}</span> : null}
                {item.detail ? <small>{item.detail}</small> : null}
              </div>
              {item.price ? <span className="workflow-price">{item.price}</span> : null}
              {item.url ? (
                <a href={item.url} rel="noreferrer" target="_blank" aria-label={`Open ${item.title}`}>
                  <ExternalLink size={15} />
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="workflow-result-footer">
        <small>{result.receipt.workflowName}{result.receipt.endpointHost ? ` via ${result.receipt.endpointHost}` : ""}</small>
        {result.status === "failed" ? (
          <button disabled={!lastFailedPrompt || isAgentRunning} onClick={() => void submitAgentPrompt(lastFailedPrompt)} type="button">
            <RotateCw size={15} /> Retry
          </button>
        ) : result.nextActions[0]?.url ? (
          <a className="button-link" href={result.nextActions[0].url} rel="noreferrer" target="_blank">
            <ExternalLink size={15} /> Open result
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function ProviderReceiptCard({ receipt }: { receipt: ProviderReceipt }) {
  return (
    <div className={`provider-receipt-card provider-receipt-${receipt.status}`}>
      <div className="provider-receipt-heading">
        <StatusPill tone={providerReceiptTone(receipt)}>{providerReceiptBadge(receipt)}</StatusPill>
        <div>
          <strong>{providerReceiptTitle(receipt)}</strong>
          <span>{receipt.display?.externalService ?? receipt.providerLabel}</span>
        </div>
      </div>
      <p>{providerReceiptDetail(receipt)}</p>
    </div>
  );
}

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
  agentNextStep: string;
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
  selectedReadableInfo: string[];
  selectedRiskyActions: string[];
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
    agentNextStep,
    isAgentRunning,
    isConversationLoading,
    lastFailedPrompt,
    permissionReview,
    promptPreview,
    runAgentChat,
    runSummary,
    scrollToClearance,
    selectedAgent,
    selectedAgentApprovals,
    selectedReadableInfo,
    selectedRiskyActions,
    setChatInput,
    submitAgentPrompt,
    suggestedPrompts
  } = props;
  const missingPermissionCount = permissionReview.filter((item) => item.schema && !item.granted).length;
  const hasCurrentAllowedInfo = allowedPermissionCount > 0;
  const hasStalePermissionBlock = missingPermissionCount === 0 && chatTranscript.some((message) => (
    message.status === "blocked_by_policy"
    && /permission|private info|access/i.test(`${message.content} ${message.nextStep ?? ""}`)
  ));
  const shouldShowRunSummary = Boolean(agentRunResult) && !(
    agentRunResult?.status === "blocked"
    && missingPermissionCount === 0
    && /permission|private info|access/i.test(`${agentRunResult.reply} ${agentRunResult.nextStep ?? ""}`)
  );

  return (
    <div className={agentProfileTab === "chat" ? "agent-use-grid" : "agent-use-grid is-tab-hidden"}>
      <section className="chat-panel agent-chat-panel" aria-label="Agent chat">
        <div className="chat-heading">
          <div>
            <strong>Ask {selectedAgent.name}</strong>
            <p>{agentNextStep}</p>
          </div>
          {isConversationLoading ? <StatusPill tone="blue">Loading…</StatusPill> : null}
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
                <button disabled={decidingApprovalId === selectedAgentApprovals[0].id} onClick={() => void decideHitl(selectedAgentApprovals[0].id, true)} type="button">
                  {decidingApprovalId === selectedAgentApprovals[0].id ? "Allowing…" : "Allow once"}
                </button>
                <button className="danger" disabled={decidingApprovalId === selectedAgentApprovals[0].id} onClick={() => void decideHitl(selectedAgentApprovals[0].id, false)} type="button">
                  {decidingApprovalId === selectedAgentApprovals[0].id ? "Saving…" : "Deny"}
                </button>
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
          <div className="suggestion-grid" aria-label="Suggested agent requests">
            {suggestedPrompts.slice(0, 2).map((prompt) => (
              <button className={`suggestion-card ${prompt.tone}`} key={prompt.prompt} onClick={() => setChatInput(prompt.prompt)} type="button">
                <strong>{prompt.label}</strong>
                <span>{prompt.prompt}</span>
                <small>{prompt.detail}</small>
              </button>
            ))}
          </div>
          <div className="send-preview agent-advanced-preview">
            <div><strong>Before It Answers</strong><span>{promptPreview.detail}</span></div>
            <div><strong>Can Read Now</strong><span>{selectedReadableInfo.length ? selectedReadableInfo.join(", ") : "No private info yet"}</span></div>
            <div><strong>Must Ask Before</strong><span>{selectedRiskyActions.length ? selectedRiskyActions.map(friendlyActionName).join(", ") : "No risky actions listed"}</span></div>
          </div>
          <form className="chat-form command-form" onSubmit={(event) => void runAgentChat(event)}>
            <input
              aria-label="Message agent"
              autoComplete="off"
              name="agent-message"
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
            <span>
              {hasCurrentAllowedInfo
                ? "This agent can use only the saved info you approved. It will still ask before sensitive actions."
                : permissionReview.length
                  ? "Allow the requested saved info when you want richer answers."
                  : "This agent does not need saved info for its starter tasks."}
            </span>
          </div>
        ) : null}

        {hasStalePermissionBlock ? (
          <div className="chat-current-state-note" role="status" aria-live="polite">
            <StatusPill tone="green">Access ready</StatusPill>
            <span>Access is now allowed. Send the request again so this agent can answer with the approved info.</span>
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
                  {message.display ? (
                    <div className="chat-display-heading">
                      <StatusPill tone={message.display.tone}>{message.display.badge}</StatusPill>
                      <strong>{message.display.title}</strong>
                    </div>
                  ) : null}
                  <p>{message.content}</p>
                  {message.role === "agent" && message.provider === "local" ? (
                    <small>Local AI: {localModelLabel(message.model)}. Agent scope and permissions were applied.</small>
                  ) : null}
                  {message.role === "agent" && externalSummary ? (
                    <div className="external-runtime-note">
                      <strong>{externalSummary}</strong>
                      <span>Ran through AI Agent Hub safety</span>
                      {externalDetail ? <small>{externalDetail}</small> : null}
                    </div>
                  ) : null}
                  {message.role === "agent" && message.workflowResult ? (
                    <WorkflowResultCard
                      result={message.workflowResult}
                      isAgentRunning={isAgentRunning}
                      lastFailedPrompt={lastFailedPrompt}
                      submitAgentPrompt={submitAgentPrompt}
                    />
                  ) : null}
                  {message.role === "agent" && message.providerReceipt ? <ProviderReceiptCard receipt={message.providerReceipt} /> : null}
                  {message.provider && message.provider !== "workflow" ? <small>Answered safely with the information this agent can use.</small> : null}
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
                        <button disabled={decidingApprovalId === pendingRequest.id} onClick={() => void decideHitl(pendingRequest.id, true)} type="button">
                          {decidingApprovalId === pendingRequest.id ? "Allowing…" : "Allow once"}
                        </button>
                        <button className="danger" disabled={decidingApprovalId === pendingRequest.id} onClick={() => void decideHitl(pendingRequest.id, false)} type="button">
                          {decidingApprovalId === pendingRequest.id ? "Saving…" : "Deny"}
                        </button>
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

        {shouldShowRunSummary && agentRunResult ? (
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
    </div>
  );
}
