import { CheckCircle2, RotateCcw, ShieldCheck } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type { CreatorAccessRequest, CreatorAgent } from "../api/types";
import { friendlyActionName, friendlyCategoryName, friendlyList, friendlyToolName } from "../lib/display";
import { StatusPill } from "./StatusPill";

type ModerationPanelProps = {
  className: string;
  queue: CreatorAgent[];
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  creatorAccessRequests: CreatorAccessRequest[];
  onApprove: (agentId: string) => Promise<CreatorAgent | null>;
  onApproveCreatorAccess: (requestId: string) => Promise<CreatorAccessRequest | null>;
  onDenyCreatorAccess: (requestId: string, note: string) => Promise<CreatorAccessRequest | null>;
  onSendBack: (agentId: string, note: string) => Promise<CreatorAgent | null>;
  onRetry: () => void;
};

function sourceLabel(sourceType: string | undefined) {
  if (sourceType === "mcp_server") return "External MCP server";
  if (sourceType === "openapi_endpoint") return "External OpenAPI endpoint";
  return "Built in AI Agent Hub";
}

export function ModerationPanel(props: ModerationPanelProps) {
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [sendBackAgent, setSendBackAgent] = useState<CreatorAgent | null>(null);
  const [sendBackNote, setSendBackNote] = useState("");
  const [denyAccessRequest, setDenyAccessRequest] = useState<CreatorAccessRequest | null>(null);
  const [denyAccessNote, setDenyAccessNote] = useState("");
  const [notice, setNotice] = useState("");
  const pendingReviewCount = props.queue.length + props.creatorAccessRequests.length;

  const selectedAgent = useMemo(
    () => props.queue.find((agent) => agent.id === selectedAgentId) ?? props.queue[0],
    [props.queue, selectedAgentId]
  );
  const selectedManifest = selectedAgent?.versions[0]?.capabilityManifest ?? {};

  async function approveSelected(agent: CreatorAgent) {
    const approved = await props.onApprove(agent.id);
    if (approved) {
      setNotice(`${approved.name} is now published.`);
      setSelectedAgentId("");
    }
  }

  async function submitSendBack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sendBackAgent) return;
    const sentBack = await props.onSendBack(sendBackAgent.id, sendBackNote);
    if (sentBack) {
      setNotice(`${sentBack.name} was sent back to draft.`);
      setSendBackAgent(null);
      setSendBackNote("");
      setSelectedAgentId("");
    }
  }

  async function approveAccessRequest(request: CreatorAccessRequest) {
    const approved = await props.onApproveCreatorAccess(request.id);
    if (approved) setNotice(`${approved.userEmail ?? "This user"} can now publish agents.`);
  }

  async function submitDenyAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!denyAccessRequest) return;
    const denied = await props.onDenyCreatorAccess(denyAccessRequest.id, denyAccessNote);
    if (denied) {
      setNotice(`${denied.userEmail ?? "This user"} was sent a creator access note.`);
      setDenyAccessRequest(null);
      setDenyAccessNote("");
    }
  }

  return (
    <div className={props.className} data-testid="moderation-panel" id="moderation">
      <div className="creator-panel-header">
        <div>
          <div className="panel-title">Review Queue</div>
          <h2>Approve agents before people can find them.</h2>
          <p>Review borderline listings for clear value, trust language, and user control.</p>
        </div>
        <StatusPill tone={pendingReviewCount ? "amber" : "green"}>{pendingReviewCount} waiting</StatusPill>
      </div>

      {props.error ? (
        <div className="friendly-error" role="status" aria-live="polite">
          <p>{props.error}</p>
          <button onClick={props.onRetry} type="button">Retry</button>
        </div>
      ) : null}

      {notice ? (
        <div className="creator-notice success" role="status" aria-live="polite">
          <div>
            <strong>Review updated</strong>
            <p>{notice}</p>
          </div>
          <button onClick={() => setNotice("")} type="button">Dismiss</button>
        </div>
      ) : null}

      {props.isLoading ? <p className="empty">Loading review queue…</p> : null}

      {!props.isLoading && !pendingReviewCount ? (
        <div className="friendly-empty-state">
          <strong>No agents need review</strong>
          <p>Creator requests and borderline agent submissions will appear here before they enter marketplace search.</p>
        </div>
      ) : null}

      {props.creatorAccessRequests.length ? (
        <section className="creator-access-review-list" aria-label="Creator access requests">
          <div>
            <h3>Creator access requests</h3>
            <p>Approve only users who describe a clear agent supply use case.</p>
          </div>
          {props.creatorAccessRequests.map((request) => (
            <article className="creator-agent-row" key={request.id}>
              <div className="creator-agent-main">
                <div>
                  <strong>{request.userEmail ?? "Local user"}</strong>
                  <small>Requested creator tools</small>
                </div>
                <StatusPill tone="amber">{request.status}</StatusPill>
              </div>
              <p>{request.reason}</p>
              <div className="button-row">
                <button disabled={props.isSaving} onClick={() => void approveAccessRequest(request)} type="button">
                  <CheckCircle2 size={16} /> {props.isSaving ? "Approving…" : "Approve access"}
                </button>
                <button disabled={props.isSaving} onClick={() => {
                  setDenyAccessRequest(request);
                  setDenyAccessNote("Please add more detail about the agents you want to publish and how they keep users in control.");
                }} type="button">
                  <RotateCcw size={16} /> Deny
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {props.queue.length ? (
        <div className="moderation-workbench">
          <div className="moderation-queue-list" aria-label="Agents waiting for review">
            {props.queue.map((agent) => (
              <button
                className={agent.id === selectedAgent?.id ? "moderation-queue-item selected" : "moderation-queue-item"}
                data-agent-name={agent.name}
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                type="button"
              >
                <span>{agent.name}</span>
                <small>{friendlyCategoryName(agent.category)} agent</small>
                <small>{agent.moderationNote || "Needs closer review"}</small>
              </button>
            ))}
          </div>

          {selectedAgent ? (
            <article className="moderation-detail" data-agent-name={selectedAgent.name}>
              <div className="creator-agent-main">
                <div>
                  <strong>{selectedAgent.name}</strong>
                  <small>{selectedAgent.creator?.displayName ?? "Community creator"}</small>
                </div>
                <StatusPill tone="amber">needs_review</StatusPill>
              </div>
              <p>{selectedAgent.tagline}</p>
              <p>{selectedAgent.description}</p>

              {selectedAgent.moderationNote ? (
                <div className="moderation-note">
                  <ShieldCheck size={16} />
                  <span>{selectedAgent.moderationNote}</span>
                </div>
              ) : null}

              <div className="moderation-facts">
                <span><strong>Source</strong>{sourceLabel(selectedManifest.sourceType)}</span>
                {selectedManifest.externalEndpointUrl ? <span><strong>Endpoint</strong>{selectedManifest.externalEndpointUrl}</span> : null}
                <span><strong>Reads</strong>{friendlyList(selectedManifest.requestedSchemas ?? [], "No private info")}</span>
                <span><strong>Tools</strong>{friendlyList((selectedManifest.tools ?? []).map(friendlyToolName), "No tools listed")}</span>
                <span><strong>Risky actions</strong>{friendlyList((selectedManifest.highRiskActions ?? []).map(friendlyActionName), "No risky actions listed")}</span>
              </div>

              {selectedManifest.sourceType && selectedManifest.sourceType !== "native" ? (
                <div className="moderation-note">
                  <ShieldCheck size={16} />
                  <span>External agent: verify the endpoint/spec, declared tools, private-info requests, and approval behavior before approval.</span>
                </div>
              ) : null}

              <div className="moderation-copy-grid">
                <div>
                  <h3>Trust reasons</h3>
                  {(selectedManifest.trustReasons ?? []).map((reason) => <p key={reason}>{reason}</p>)}
                </div>
                {selectedManifest.verificationSummary?.length ? (
                  <div>
                    <h3>Verification notes</h3>
                    {selectedManifest.verificationSummary.map((note) => <p key={note}>{note}</p>)}
                  </div>
                ) : null}
                <div>
                  <h3>Example prompts</h3>
                  {(selectedManifest.examplePrompts ?? []).map((prompt) => <p key={prompt}>{prompt}</p>)}
                </div>
              </div>

              <div className="button-row">
                <button data-testid={`moderation-approve-${selectedAgent.id}`} disabled={props.isSaving} onClick={() => void approveSelected(selectedAgent)} type="button">
                  <CheckCircle2 size={16} /> {props.isSaving ? "Approving…" : "Approve"}
                </button>
                <button data-testid={`moderation-send-back-${selectedAgent.id}`} disabled={props.isSaving} onClick={() => {
                  setSendBackAgent(selectedAgent);
                  setSendBackNote(selectedAgent.moderationNote || "");
                }} type="button">
                  <RotateCcw size={16} /> Send back
                </button>
              </div>
            </article>
          ) : null}
        </div>
      ) : null}

      {sendBackAgent ? (
        <div className="confirm-backdrop" role="presentation">
          <form aria-labelledby="send-back-title" aria-modal="true" className="confirm-dialog" onSubmit={(event) => void submitSendBack(event)} role="dialog">
            <div className="panel-title">Send Back</div>
            <h2 id="send-back-title">Send {sendBackAgent.name} back to draft?</h2>
            <p>This note will be shown to the creator so they know what to fix.</p>
            <label>
              <span>Review note</span>
              <textarea
                maxLength={500}
                minLength={8}
                onChange={(event) => setSendBackNote(event.currentTarget.value)}
                required
                rows={4}
                value={sendBackNote}
              />
            </label>
            <div className="button-row">
              <button data-testid="moderation-confirm-send-back" disabled={props.isSaving} type="submit">
                <RotateCcw size={16} /> {props.isSaving ? "Sending…" : "Send back"}
              </button>
              <button disabled={props.isSaving} onClick={() => setSendBackAgent(null)} type="button">Cancel</button>
            </div>
          </form>
        </div>
      ) : null}

      {denyAccessRequest ? (
        <div className="confirm-backdrop" role="presentation">
          <form aria-labelledby="deny-access-title" aria-modal="true" className="confirm-dialog" onSubmit={(event) => void submitDenyAccess(event)} role="dialog">
            <div className="panel-title">Deny Access</div>
            <h2 id="deny-access-title">Deny creator access?</h2>
            <p>This note will be shown in Settings so the user knows what to improve.</p>
            <label>
              <span>Review note</span>
              <textarea
                maxLength={500}
                minLength={8}
                onChange={(event) => setDenyAccessNote(event.currentTarget.value)}
                required
                rows={4}
                value={denyAccessNote}
              />
            </label>
            <div className="button-row">
              <button data-testid="creator-access-confirm-deny" disabled={props.isSaving} type="submit">
                <RotateCcw size={16} /> {props.isSaving ? "Denying…" : "Deny access"}
              </button>
              <button disabled={props.isSaving} onClick={() => setDenyAccessRequest(null)} type="button">Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
