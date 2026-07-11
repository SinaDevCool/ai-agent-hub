import { Plus } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { CreatorAgent, CreatorAgentDraftInput, CreatorProfile, CreatorPublishResult, VaultSchema } from "../api/types";
import { CreatorAgentList } from "./creator/CreatorAgentList";
import { ArchiveConfirmDialog, PublishConfirmDialog } from "./creator/CreatorDialogs";
import { CreatorDraftForm } from "./creator/CreatorDraftForm";
import { CreatorProfileEditor } from "./creator/CreatorProfileEditor";
import {
  defaultCreatorForm,
  draftFromForm,
  formFromAgent,
  readinessFor,
  type CreatorFormState
} from "./creator/creatorForm";

type CreatorNotice = {
  tone: "success" | "info";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type CreatorPanelProps = {
  className: string;
  profile: CreatorProfile | null;
  agentsByStatus: {
    drafts: CreatorAgent[];
    needsReview: CreatorAgent[];
    published: CreatorAgent[];
    archived: CreatorAgent[];
  };
  schemas: VaultSchema[];
  categoryOptions: string[];
  toolOptions: string[];
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  onSaveProfile: (profile: { displayName: string; bio: string }) => Promise<CreatorProfile | null>;
  onCreateDraft: (draft: CreatorAgentDraftInput) => Promise<CreatorAgent | null>;
  onUpdateDraft: (agentId: string, draft: Partial<CreatorAgentDraftInput>) => Promise<CreatorAgent | null>;
  onPublish: (agentId: string) => Promise<CreatorPublishResult | null>;
  onArchive: (agentId: string) => Promise<CreatorAgent | null>;
  onRetry: () => void;
  onViewMarketplace: (agent: CreatorAgent) => void;
};

export function CreatorPanel(props: CreatorPanelProps) {
  const [profileDraft, setProfileDraft] = useState({
    displayName: props.profile?.displayName ?? "",
    bio: props.profile?.bio ?? ""
  });
  const [form, setForm] = useState<CreatorFormState>(defaultCreatorForm);
  const [editingAgent, setEditingAgent] = useState<CreatorAgent | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [publishCandidate, setPublishCandidate] = useState<CreatorAgent | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<CreatorAgent | null>(null);
  const [notice, setNotice] = useState<CreatorNotice | null>(null);

  const readiness = useMemo(() => readinessFor(form), [form]);
  const publishReadiness = publishCandidate ? readinessFor(formFromAgent(publishCandidate)) : null;
  const isEditingReturnedDraft = editingAgent?.status === "draft" && Boolean(editingAgent.moderationNote);
  const isPublishingReturnedDraft = publishCandidate?.status === "draft" && Boolean(publishCandidate.moderationNote);
  const totalAgentCount = props.agentsByStatus.drafts.length
    + props.agentsByStatus.needsReview.length
    + props.agentsByStatus.published.length
    + props.agentsByStatus.archived.length;

  useEffect(() => {
    setProfileDraft({
      displayName: props.profile?.displayName ?? "",
      bio: props.profile?.bio ?? ""
    });
  }, [props.profile]);

  function updateForm(next: Partial<CreatorFormState>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function toggleListValue(values: string[], value: string) {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  }

  function openNewDraft() {
    setNotice(null);
    setEditingAgent(null);
    setForm(defaultCreatorForm);
    setIsFormOpen(true);
  }

  function openEditDraft(agent: CreatorAgent) {
    setNotice(null);
    setEditingAgent(agent);
    setForm(formFromAgent(agent));
    setIsFormOpen(true);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await props.onSaveProfile(profileDraft);
    if (saved) {
      setProfileDraft({ displayName: saved.displayName, bio: saved.bio });
      setNotice({
        tone: "success",
        title: "Creator profile saved",
        message: "This is the name people see on your agent listings."
      });
    }
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = draftFromForm(form);
    const wasEditing = Boolean(editingAgent);
    const saved = editingAgent
      ? await props.onUpdateDraft(editingAgent.id, draft)
      : await props.onCreateDraft(draft);
    if (saved) {
      setEditingAgent(saved.status === "draft" ? saved : null);
      setForm(saved.status === "draft" ? formFromAgent(saved) : defaultCreatorForm);
      setIsFormOpen(false);
      setNotice({
        tone: "success",
        title: wasEditing ? "Draft updated" : "Draft saved",
        message: isEditingReturnedDraft
          ? "Your changes are saved. The review note stays here until you publish the updated agent."
          : wasEditing ? "Your changes are saved." : "You can publish it when the checklist is complete."
      });
    }
  }

  async function publishAgent(agent: CreatorAgent) {
    const result = await props.onPublish(agent.id);
    if (result) {
      const published = result.agent;
      setPublishCandidate(null);
      if (published.status === "needs_review") {
        setNotice({
          tone: "info",
          title: "Sent for review",
          message: result.readiness.message || "This agent is saved for review before it appears in marketplace search."
        });
      } else {
        setNotice({
          tone: "success",
          title: "Your agent is live",
          message: "People can now find it in the marketplace. They still control what private info it can read.",
          actionLabel: "View in marketplace",
          onAction: () => props.onViewMarketplace(published)
        });
      }
    }
  }

  async function confirmArchiveAgent(agent: CreatorAgent) {
    const archived = await props.onArchive(agent.id);
    if (archived) {
      setArchiveCandidate(null);
      setNotice({
        tone: "info",
        title: "Agent archived",
        message: "It is hidden from marketplace search and kept in your creator records."
      });
    }
  }

  return (
    <div className={props.className} data-testid="creator-panel" id="creator">
      <div className="creator-panel-header">
        <div>
          <div className="panel-title">Creator Studio</div>
          <h2>Publish agents normal people can understand.</h2>
          <p>Create an agent listing, explain what it does, disclose access, and publish it into the marketplace.</p>
        </div>
        <button className="primary-action" data-testid="creator-new-agent" onClick={openNewDraft} type="button"><Plus size={16} /> New agent</button>
      </div>

      <div className="creator-status-summary" aria-label="Creator listing summary">
        <div><strong>{props.agentsByStatus.drafts.length}</strong><span>Drafts</span></div>
        <div><strong>{props.agentsByStatus.needsReview.length}</strong><span>In review</span></div>
        <div><strong>{props.agentsByStatus.published.length}</strong><span>Published</span></div>
        <div><strong>{props.agentsByStatus.archived.length}</strong><span>Archived</span></div>
      </div>

      {props.error ? (
        <div className="friendly-error" role="status" aria-live="polite">
          <p>{props.error}</p>
          <button onClick={props.onRetry} type="button">Retry</button>
        </div>
      ) : null}

      {notice ? (
        <div className={`creator-notice ${notice.tone}`} data-testid="creator-notice" role="status" aria-live="polite">
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.message}</p>
          </div>
          {notice.actionLabel ? <button data-testid="creator-notice-action" onClick={notice.onAction} type="button">{notice.actionLabel}</button> : null}
          <button onClick={() => setNotice(null)} type="button">Dismiss</button>
        </div>
      ) : null}

      <CreatorProfileEditor
        bio={profileDraft.bio}
        displayName={profileDraft.displayName}
        isSaving={props.isSaving}
        onBioChange={(bio) => setProfileDraft((current) => ({ ...current, bio }))}
        onDisplayNameChange={(displayName) => setProfileDraft((current) => ({ ...current, displayName }))}
        onSubmit={saveProfile}
        profile={props.profile}
      />

      {isFormOpen ? (
        <CreatorDraftForm
          categoryOptions={props.categoryOptions}
          editingAgent={editingAgent}
          form={form}
          isEditingReturnedDraft={Boolean(isEditingReturnedDraft)}
          isSaving={props.isSaving}
          onCancel={() => setIsFormOpen(false)}
          onSubmit={saveDraft}
          readiness={readiness}
          schemas={props.schemas}
          toggleListValue={toggleListValue}
          toolOptions={props.toolOptions}
          updateForm={updateForm}
        />
      ) : null}

      {!isFormOpen && totalAgentCount === 0 && !props.isLoading ? (
        <div className="friendly-empty-state">
          <strong>Create your first marketplace agent</strong>
          <p>Start with one focused agent for a real need like travel, daily tasks, money, or shopping.</p>
          <button data-testid="creator-empty-new-agent" onClick={openNewDraft} type="button"><Plus size={16} /> New agent</button>
        </div>
      ) : null}

      {props.isLoading ? <p className="empty">Loading creator agents…</p> : null}

      <CreatorAgentList
        agentsByStatus={props.agentsByStatus}
        isSaving={props.isSaving}
        onArchive={setArchiveCandidate}
        onArchiveDraftDirectly={(agent) => void props.onArchive(agent.id)}
        onEdit={openEditDraft}
        onPublish={setPublishCandidate}
        onViewMarketplace={props.onViewMarketplace}
      />

      {publishCandidate ? (
        <PublishConfirmDialog
          agent={publishCandidate}
          isPublishingReturnedDraft={Boolean(isPublishingReturnedDraft)}
          isSaving={props.isSaving}
          onCancel={() => setPublishCandidate(null)}
          onPublish={() => void publishAgent(publishCandidate)}
          readiness={publishReadiness}
        />
      ) : null}
      {archiveCandidate ? (
        <ArchiveConfirmDialog
          agent={archiveCandidate}
          isSaving={props.isSaving}
          onArchive={() => void confirmArchiveAgent(archiveCandidate)}
          onCancel={() => setArchiveCandidate(null)}
        />
      ) : null}
    </div>
  );
}
