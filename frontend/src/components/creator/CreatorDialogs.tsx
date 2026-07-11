import { Archive, Rocket } from "lucide-react";
import type { CreatorAgent } from "../../api/types";

type PublishReadiness = {
  checks: Array<{ label: string; passed: boolean; required: boolean; guidance: string }>;
  missingRequired: Array<{ label: string; guidance: string }>;
  reviewItems: Array<{ label: string; guidance: string }>;
  canSubmit: boolean;
};

export function PublishConfirmDialog(props: {
  agent: CreatorAgent;
  isPublishingReturnedDraft: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onPublish: () => void;
  readiness: PublishReadiness | null;
}) {
  return (
    <div className="confirm-backdrop" role="presentation">
      <section aria-labelledby="publish-dialog-title" aria-modal="true" className="confirm-dialog publish-confirm-dialog" role="dialog">
        <div className="panel-title">{props.isPublishingReturnedDraft ? "Resubmit Agent" : "Publish Agent"}</div>
        <h2 id="publish-dialog-title">{props.isPublishingReturnedDraft ? "Resubmit" : "Publish"} {props.agent.name}?</h2>
        <p>
          {props.isPublishingReturnedDraft
            ? "This checks the updated agent again. Strong listings can go live; borderline listings return to review."
            : "This makes the agent discoverable in the marketplace. People can install it, but private info still requires their approval."}
        </p>
        {props.isPublishingReturnedDraft && props.agent.moderationNote ? (
          <div className="moderation-note creator-review-note">
            <span>Review note: {props.agent.moderationNote}</span>
          </div>
        ) : null}
        <div className="publish-checklist">
          {props.readiness?.checks.map((check) => (
            <span className={check.passed ? "passed" : ""} key={check.label}>{check.label}</span>
          ))}
        </div>
        {props.readiness?.missingRequired.length ? (
          <div className="creator-readiness-guidance">
            {props.readiness.missingRequired.slice(0, 3).map((check) => <span key={check.label}>{check.guidance}</span>)}
          </div>
        ) : props.readiness?.reviewItems.length ? (
          <div className="creator-readiness-guidance">
            {props.readiness.reviewItems.slice(0, 2).map((check) => <span key={check.label}>{check.guidance}</span>)}
          </div>
        ) : null}
        <div className="button-row">
          <button data-testid="creator-confirm-publish" disabled={props.isSaving || !props.readiness?.canSubmit} onClick={props.onPublish} type="button">
            <Rocket size={16} /> {props.isSaving ? "Publishing…" : props.readiness?.reviewItems.length ? "Submit for review" : "Publish"}
          </button>
          <button disabled={props.isSaving} onClick={props.onCancel} type="button">Cancel</button>
        </div>
      </section>
    </div>
  );
}

export function ArchiveConfirmDialog(props: {
  agent: CreatorAgent;
  isSaving: boolean;
  onArchive: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirm-backdrop" role="presentation">
      <section
        aria-describedby="archive-dialog-copy"
        aria-labelledby="archive-dialog-title"
        aria-modal="true"
        className="confirm-dialog archive-confirm-dialog"
        role="dialog"
      >
        <div className="panel-title">Archive Agent</div>
        <h2 id="archive-dialog-title">Archive {props.agent.name}?</h2>
        <p id="archive-dialog-copy">It will be hidden from marketplace search. People who already installed it keep their records, but new people will not find it.</p>
        <div className="button-row">
          <button className="danger" data-testid="creator-confirm-archive" disabled={props.isSaving} onClick={props.onArchive} type="button">
            <Archive size={16} /> {props.isSaving ? "Archiving…" : "Archive agent"}
          </button>
          <button disabled={props.isSaving} onClick={props.onCancel} type="button">Keep agent</button>
        </div>
      </section>
    </div>
  );
}
