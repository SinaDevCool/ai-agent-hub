import type { WorkspaceSectionsProps } from "./WorkspaceSections.types";
import { CreatorPanel } from "../CreatorPanel";
import { ModerationPanel } from "../ModerationPanel";

export function CreatorAdminPanels({ props }: { props: WorkspaceSectionsProps }) {
  const {
    activeMobileClass,
    canModerateMarketplace,
    canUseCreatorTools,
    categoryOptions,
    creator,
    creatorAccess,
    moderation,
    refresh,
    schemas,
    scrollToSection,
    sectionClass,
    setMarketplaceCategory,
    setMarketplaceSearch,
    toolOptions
  } = props;

  if (!canUseCreatorTools && !canModerateMarketplace) return null;

  return (
    <>
      {canUseCreatorTools ? (
        <CreatorPanel
          agentsByStatus={creator.agentsByStatus}
          categoryOptions={categoryOptions}
          className={`panel creator-panel mobile-section desktop-section ${activeMobileClass("creator")} ${sectionClass("creator")}`}
          error={creator.error}
          isLoading={creator.isLoading}
          isSaving={creator.isSaving}
          onArchive={async (agentId) => {
            const archived = await creator.archiveAgent(agentId);
            if (archived) await refresh();
            return archived;
          }}
          onCreateDraft={creator.createDraft}
          onPublish={async (agentId) => {
            const result = await creator.publishDraft(agentId);
            if (result) {
              await refresh();
              if (result.agent.status === "needs_review" && canModerateMarketplace) await moderation.refreshModerationQueue();
            }
            return result;
          }}
          onRetry={() => void creator.refreshCreator()}
          onSaveProfile={creator.saveProfile}
          onUpdateDraft={creator.updateDraft}
          onViewMarketplace={(agent) => {
            setMarketplaceSearch(agent.name);
            setMarketplaceCategory("All");
            scrollToSection("marketplace");
          }}
          profile={creator.profile}
          schemas={schemas}
          toolOptions={toolOptions}
        />
      ) : null}
      {canModerateMarketplace ? (
        <ModerationPanel
          className={`panel moderation-panel mobile-section desktop-section ${activeMobileClass("moderation")} ${sectionClass("moderation")}`}
          creatorAccessRequests={creatorAccess.requests}
          error={moderation.error}
          isLoading={moderation.isLoading}
          isSaving={moderation.isSaving || creatorAccess.isSaving}
          onApprove={async (agentId) => {
            const approved = await moderation.approveAgent(agentId);
            if (approved) {
              await Promise.all([refresh(), creator.refreshCreator()]);
            }
            return approved;
          }}
          onApproveCreatorAccess={async (requestId) => {
            const approved = await creatorAccess.approveCreatorAccess(requestId);
            if (approved) await creatorAccess.refreshCreatorAccessRequests();
            return approved;
          }}
          onDenyCreatorAccess={async (requestId, note) => {
            const denied = await creatorAccess.denyCreatorAccess(requestId, note);
            if (denied) await creatorAccess.refreshCreatorAccessRequests();
            return denied;
          }}
          onRetry={() => {
            void moderation.refreshModerationQueue();
            void creatorAccess.refreshCreatorAccessRequests();
          }}
          onSendBack={async (agentId, note) => {
            const sentBack = await moderation.sendBackAgent(agentId, note);
            if (sentBack) await creator.refreshCreator();
            return sentBack;
          }}
          queue={moderation.queue}
        />
      ) : null}
    </>
  );
}
