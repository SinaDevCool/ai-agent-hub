import type { CreatorAgent } from "../../api/types";
import { CreatorAgentRow } from "./CreatorAgentRow";

type CreatorAgentGroups = {
  drafts: CreatorAgent[];
  needsReview: CreatorAgent[];
  published: CreatorAgent[];
  archived: CreatorAgent[];
};

type CreatorAgentListProps = {
  agentsByStatus: CreatorAgentGroups;
  isSaving: boolean;
  onArchive: (agent: CreatorAgent) => void;
  onArchiveDraftDirectly: (agent: CreatorAgent) => void;
  onEdit: (agent: CreatorAgent) => void;
  onPublish: (agent: CreatorAgent) => void;
  onViewMarketplace: (agent: CreatorAgent) => void;
};

export function CreatorAgentList(props: CreatorAgentListProps) {
  const { agentsByStatus, isSaving, onArchive, onArchiveDraftDirectly, onEdit, onPublish, onViewMarketplace } = props;

  return (
    <div className="creator-status-grid">
      <section>
        <h3>Drafts</h3>
        {agentsByStatus.drafts.map((agent) => (
          <CreatorAgentRow
            agent={agent}
            isSaving={isSaving}
            key={agent.id}
            onArchive={onArchiveDraftDirectly}
            onEdit={onEdit}
            onPublish={onPublish}
            onViewMarketplace={onViewMarketplace}
          />
        ))}
        {!agentsByStatus.drafts.length ? <p className="empty">Draft agents appear here before they go live.</p> : null}
      </section>

      <section>
        <h3>Needs review</h3>
        {agentsByStatus.needsReview.map((agent) => (
          <CreatorAgentRow
            agent={agent}
            isSaving={isSaving}
            key={agent.id}
            onArchive={onArchive}
            onEdit={onEdit}
            onPublish={onPublish}
            onViewMarketplace={onViewMarketplace}
          />
        ))}
        {!agentsByStatus.needsReview.length ? <p className="empty">Listings that need a closer look appear here.</p> : null}
      </section>

      <section>
        <h3>Published</h3>
        {agentsByStatus.published.map((agent) => (
          <CreatorAgentRow
            agent={agent}
            isSaving={isSaving}
            key={agent.id}
            onArchive={onArchive}
            onEdit={onEdit}
            onPublish={onPublish}
            onViewMarketplace={onViewMarketplace}
          />
        ))}
        {!agentsByStatus.published.length ? <p className="empty">Published agents become visible in the marketplace.</p> : null}
      </section>

      <section>
        <h3>Archived</h3>
        {agentsByStatus.archived.map((agent) => (
          <CreatorAgentRow
            agent={agent}
            isSaving={isSaving}
            key={agent.id}
            onArchive={onArchiveDraftDirectly}
            onEdit={onEdit}
            onPublish={onPublish}
            onViewMarketplace={onViewMarketplace}
          />
        ))}
        {!agentsByStatus.archived.length ? <p className="empty">Archived agents are kept here for records.</p> : null}
      </section>
    </div>
  );
}
