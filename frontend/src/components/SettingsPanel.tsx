import { Download, KeyRound, LogOut, Pencil, ShieldOff } from "lucide-react";
import type { FormEvent } from "react";
import type { CreatorAccessRequest } from "../api/types";

export function SettingsPanel(props: {
  activityCount: number;
  canUseCreatorTools: boolean;
  className: string;
  creatorAccessError: string;
  creatorAccessReason: string;
  creatorAccessRequest: CreatorAccessRequest | null;
  agentCount: number;
  isCreatorAccessSaving: boolean;
  onExportData: () => void;
  onManageAccess: () => void;
  onOpenCreator: () => void;
  onCreatorAccessReasonChange: (reason: string) => void;
  onRequestCreatorAccess: () => Promise<CreatorAccessRequest | null>;
  onRevokeAllAccess: () => void;
  onSignOut?: () => void;
  privateInfoCount: number;
  userEmail: string;
}) {
  function submitCreatorRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void props.onRequestCreatorAccess();
  }

  const showCreatorRequestForm = !props.canUseCreatorTools && props.creatorAccessRequest?.status !== "pending";

  return (
    <div className={props.className} id="settings">
      <div className="panel-heading-row settings-heading-row">
        <div>
          <div className="panel-title">Settings</div>
          <p className="mobile-section-intro">Manage your account, saved info access, and data export.</p>
        </div>
      </div>
      <div className="settings-primary-actions" aria-label="Main settings actions">
        <button className="primary-action" onClick={props.onManageAccess} type="button"><KeyRound size={16} /> Manage access</button>
        <button onClick={props.onExportData} type="button"><Download size={16} /> Export my data</button>
        <button onClick={props.onRevokeAllAccess} type="button"><ShieldOff size={16} /> Remove all agent access</button>
      </div>
      <div className="settings-grid">
        <div><strong>Agents</strong><span>{props.agentCount}</span></div>
        <div><strong>Saved info</strong><span>{props.privateInfoCount}</span></div>
        <div><strong>Activity</strong><span>{props.activityCount}</span></div>
        <div><strong>Account</strong><span>{props.userEmail}</span></div>
      </div>
      <div className="settings-section-grid">
        {props.canUseCreatorTools ? <section>
          <strong>Creator tools available</strong>
          <span>Create and publish agents when you want to supply the marketplace.</span>
          <button onClick={props.onOpenCreator} type="button"><Pencil size={16} /> Open Creator Studio</button>
        </section> : (
          <section className="creator-access-card">
            <strong>Want to publish agents?</strong>
            {props.creatorAccessRequest?.status === "pending" ? (
              <span>Creator request pending. We will unlock publishing after marketplace review.</span>
            ) : props.creatorAccessRequest?.status === "denied" ? (
              <span>{props.creatorAccessRequest.reviewNote || "Your last request needs more detail before creator tools can be enabled."}</span>
            ) : (
              <span>Request creator access when you are ready.</span>
            )}
            {props.creatorAccessError ? <small className="form-error">{props.creatorAccessError}</small> : null}
            {showCreatorRequestForm ? (
              <form className="creator-access-form" onSubmit={submitCreatorRequest}>
                <label>
                  <span>What do you want to publish?</span>
                  <textarea
                    maxLength={800}
                    minLength={12}
                    onChange={(event) => props.onCreatorAccessReasonChange(event.currentTarget.value)}
                    placeholder="Example: travel agents that plan trips and ask before booking."
                    required
                    rows={3}
                    value={props.creatorAccessReason}
                  />
                </label>
                <button disabled={props.isCreatorAccessSaving} type="submit">
                  <Pencil size={16} /> {props.isCreatorAccessSaving ? "Requesting…" : "Request creator access"}
                </button>
              </form>
            ) : null}
          </section>
        )}
        <section>
          <strong>Privacy note</strong>
          <span>Agents start restricted. If you remove all access, they stop using saved info until you allow access again.</span>
        </section>
      </div>
      <div className="privacy-actions">
        {props.onSignOut ? <button onClick={props.onSignOut} type="button"><LogOut size={16} /> Sign out</button> : null}
      </div>
      <p className="empty">Your workspace data is scoped to your signed-in account.</p>
    </div>
  );
}
