import { Bot, KeyRound, MessageSquare, Search, X } from "lucide-react";
import { friendlyActionName, friendlyList } from "../lib/display";

export type RecentInstallSummary = {
  agentId?: string;
  displayName: string;
  category: string;
  requestedSchemas: string[];
  highRiskActions: string[];
  firstPrompt: string;
};

type InstallSuccessPanelProps = {
  install: RecentInstallSummary;
  onDismiss: () => void;
  onFindAnother: () => void;
  onReviewAccess: () => void;
  onTryPrompt: () => void;
};

export function InstallSuccessPanel({ install, onDismiss, onFindAnother, onReviewAccess, onTryPrompt }: InstallSuccessPanelProps) {
  const hasPrivateInfo = install.requestedSchemas.length > 0;
  const hasSensitiveActions = install.highRiskActions.length > 0;
  const canOpenHelper = Boolean(install.agentId);
  const firstPrompt = install.firstPrompt || `Ask ${install.displayName} for help with ${install.category.toLowerCase()}.`;
  const sensitiveActionLabel = friendlyList(install.highRiskActions.map(friendlyActionName), "sensitive actions");
  const sensitiveActionSentence = `${sensitiveActionLabel.charAt(0).toLowerCase()}${sensitiveActionLabel.slice(1)}`;

  return (
    <section className="panel install-success-panel" aria-label={`${install.displayName} next steps`} aria-live="polite">
      <div className="install-success-copy">
        <div className="panel-title">Helper Added</div>
        <h2><Bot aria-hidden="true" size={20} /> {install.displayName}</h2>
        <p>{hasPrivateInfo ? "It is ready. You decide which private info it can use." : "It is ready to use now."}</p>
      </div>

      <div className="install-success-summary" aria-label="Helper access summary">
        <div>
          <strong>Try first</strong>
          <span>{firstPrompt}</span>
        </div>
        <div>
          <strong>Private info</strong>
          <span>{friendlyList(install.requestedSchemas, "No private info needed")}</span>
        </div>
        <div>
          <strong>Safety</strong>
          <span>{hasSensitiveActions ? `Asks before ${sensitiveActionSentence}` : "No sensitive actions listed"}</span>
        </div>
      </div>

      <div className="install-success-actions">
        <button className="primary-action" disabled={!canOpenHelper} onClick={onTryPrompt} type="button">
          <MessageSquare aria-hidden="true" size={16} /> Use helper
        </button>
        {hasPrivateInfo ? (
          <button onClick={onReviewAccess} type="button"><KeyRound aria-hidden="true" size={16} /> Review access</button>
        ) : null}
        <button className="install-find-another-action" onClick={onFindAnother} type="button"><Search aria-hidden="true" size={16} /> Find another</button>
        <button aria-label="Dismiss install next steps" className="install-dismiss-action" onClick={onDismiss} type="button"><X aria-hidden="true" size={16} /></button>
      </div>
    </section>
  );
}
