import { Archive, Eye, Pencil, Rocket } from "lucide-react";
import type { CreatorAgent } from "../../api/types";
import { friendlyActionName, friendlyCategoryName, friendlyList } from "../../lib/display";
import { StatusPill } from "../StatusPill";

function statusTone(status: CreatorAgent["status"]) {
  if (status === "published") return "green";
  if (status === "archived" || status === "needs_review") return "amber";
  return "blue";
}

function sourceLabel(sourceType?: string) {
  if (sourceType === "mcp_server") return "External MCP";
  if (sourceType === "openapi_endpoint") return "External OpenAPI";
  return "Native agent";
}

export function CreatorAgentRow(props: {
  agent: CreatorAgent;
  onEdit: (agent: CreatorAgent) => void;
  onPublish: (agent: CreatorAgent) => void;
  onArchive: (agent: CreatorAgent) => void;
  onViewMarketplace: (agent: CreatorAgent) => void;
  isSaving: boolean;
}) {
  const manifest = props.agent.versions[0]?.capabilityManifest ?? {};
  const isReturnedDraft = props.agent.status === "draft" && Boolean(props.agent.moderationNote);
  return (
    <article className="creator-agent-row" data-agent-name={props.agent.name} data-testid={`creator-agent-row-${props.agent.id}`}>
      <div className="creator-agent-main">
        <div>
          <strong>{props.agent.name}</strong>
          <small>{friendlyCategoryName(props.agent.category)} agent</small>
        </div>
        <StatusPill tone={isReturnedDraft ? "amber" : statusTone(props.agent.status)}>{isReturnedDraft ? "returned" : props.agent.status}</StatusPill>
      </div>
      <p>{props.agent.tagline || props.agent.description}</p>
      {props.agent.moderationNote ? (
        <div className="moderation-note creator-review-note">
          <span>Review note: {props.agent.moderationNote}</span>
        </div>
      ) : null}
      <div className="creator-agent-meta">
        <span>{sourceLabel(manifest.sourceType)}</span>
        <span>{friendlyList(manifest.requestedSchemas ?? [], "No private info")}</span>
        <span>{friendlyList(manifest.highRiskActions?.map(friendlyActionName) ?? [], "No risky actions listed")}</span>
        <span>{props.agent.installCount} installs</span>
      </div>
      <div className="creator-agent-actions">
        {props.agent.status === "draft" ? (
          <>
            <button data-testid={`creator-edit-${props.agent.id}`} onClick={() => props.onEdit(props.agent)} type="button"><Pencil size={15} /> {isReturnedDraft ? "Fix and resubmit" : "Edit"}</button>
            <button data-testid={`creator-publish-${props.agent.id}`} disabled={props.isSaving} onClick={() => props.onPublish(props.agent)} type="button"><Rocket size={15} /> Publish</button>
          </>
        ) : null}
        {props.agent.status === "published" ? (
          <>
            <button data-testid={`creator-view-${props.agent.id}`} onClick={() => props.onViewMarketplace(props.agent)} type="button"><Eye size={15} /> View</button>
            <button className="danger" data-testid={`creator-archive-${props.agent.id}`} disabled={props.isSaving} onClick={() => props.onArchive(props.agent)} type="button"><Archive size={15} /> Archive</button>
          </>
        ) : null}
        {props.agent.status === "needs_review" ? (
          <>
            <button data-testid={`creator-edit-${props.agent.id}`} onClick={() => props.onEdit(props.agent)} type="button"><Pencil size={15} /> Edit</button>
            <button className="danger" data-testid={`creator-archive-${props.agent.id}`} disabled={props.isSaving} onClick={() => props.onArchive(props.agent)} type="button"><Archive size={15} /> Archive</button>
          </>
        ) : null}
        {props.agent.status === "archived" ? <span>Archived agents stay out of marketplace search.</span> : null}
      </div>
    </article>
  );
}
