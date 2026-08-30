import { Check, Clock3, FilePlus, KeyRound, LockKeyhole } from "lucide-react";
import type { Agent, VaultSchema } from "../api/types";
import { isExternalAgent } from "../lib/externalRuntimeDisplay";
import { StatusPill } from "./StatusPill";

type PermissionCenterRow = {
  schema: VaultSchema;
  allowedAgents: Agent[];
  requestingAgents: Agent[];
};

type PermissionsPanelProps = {
  className: string;
  selectedAgent?: Agent;
  ungrantedRequestedCount: number;
  allowedPermissionCount: number;
  approvalCount: number;
  permissionCenterRows: PermissionCenterRow[];
  onAddPrivateInfo: () => void;
  onTogglePermission: (schema: VaultSchema, enabled: boolean) => void | Promise<void>;
  grantingSchemaName: string;
  notice: string;
};

export function PermissionsPanel(props: PermissionsPanelProps) {
  const {
    className,
    selectedAgent,
    ungrantedRequestedCount,
    allowedPermissionCount,
    approvalCount,
    permissionCenterRows,
    onAddPrivateInfo,
    onTogglePermission,
    grantingSchemaName,
    notice
  } = props;
  const selectedIsExternal = isExternalAgent(selectedAgent);
  const requestedRows = permissionCenterRows.filter(({ schema }) => selectedAgent?.capabilityManifest.requestedSchemas?.includes(schema.name));
  const otherRows = permissionCenterRows.filter(({ schema }) => !selectedAgent?.capabilityManifest.requestedSchemas?.includes(schema.name));

  function renderPermissionRow({ schema, allowedAgents, requestingAgents }: PermissionCenterRow) {
    const granted = Boolean(selectedAgent?.permissions.some((permission) => permission.vaultSchemaId === schema.id && permission.permissionType === "read"));
    const selectedRequestsThis = Boolean(selectedAgent?.capabilityManifest.requestedSchemas?.includes(schema.name));
    const allowedSummary = allowedAgents.length
      ? `${allowedAgents.length} agent${allowedAgents.length === 1 ? "" : "s"} can use this info.`
      : "No agent can use this info yet.";
    const requestSummary = requestingAgents.length
      ? `${requestingAgents.length} agent${requestingAgents.length === 1 ? "" : "s"} may ask for this info.`
      : "";
    const isSaving = grantingSchemaName === schema.name || grantingSchemaName === "all";
    return (
      <div className="clearance-row permission-category-row" key={schema.id}>
        <span className={`permission-state ${granted ? "is-allowed" : ""}`}>
          {granted ? <Check aria-hidden="true" size={15} /> : <LockKeyhole aria-hidden="true" size={15} />}
          {granted ? "Allowed" : selectedRequestsThis ? "Needs access" : "Not allowed"}
        </span>
        <div>
          <strong>{schema.name}</strong>
          <small>{schema.description}</small>
          <small>
            {selectedIsExternal && selectedRequestsThis
              ? `${selectedAgent?.name ?? "This external agent"} can receive only the snippets you allow.`
              : selectedRequestsThis ? `${selectedAgent?.name ?? "This agent"} is asking to use this saved info.` : `${selectedAgent?.name ?? "This agent"} is not asking for this right now.`}
          </small>
          <small>{allowedSummary}</small>
          {requestSummary ? <small>{requestSummary}</small> : null}
        </div>
        <button
          aria-label={`${granted ? "Remove access to" : "Allow access to"} ${schema.name} for ${selectedAgent?.name ?? "this agent"}`}
          disabled={isSaving}
          onClick={() => void onTogglePermission(schema, !granted)}
          type="button"
        >
          {isSaving ? "Saving…" : granted ? "Remove access" : selectedRequestsThis ? "Allow access" : "Allow"}
        </button>
      </div>
    );
  }

  return (
    <div className={className} id="clearance">
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">Private Data Access</div>
          <p className="mobile-section-intro">
            {selectedIsExternal
              ? `Choose what saved info ${selectedAgent?.name ?? "this external agent"} can receive through AI Agent Hub safety.`
              : `Choose what saved info ${selectedAgent?.name ?? "this agent"} can use. You can change this at any time.`}
          </p>
        </div>
        <StatusPill tone={ungrantedRequestedCount ? "amber" : "green"}>
          {ungrantedRequestedCount ? `${ungrantedRequestedCount} needs access` : "all clear"}
        </StatusPill>
      </div>
      <div className="permission-center-summary">
        <div><Clock3 aria-hidden="true" size={17} /><strong>{approvalCount}</strong><span>Waiting for you</span></div>
        <div><LockKeyhole aria-hidden="true" size={17} /><strong>{ungrantedRequestedCount}</strong><span>Needs access</span></div>
        <div><KeyRound aria-hidden="true" size={17} /><strong>{allowedPermissionCount}</strong><span>Allowed</span></div>
      </div>
      <p className="permission-scope-note"><LockKeyhole aria-hidden="true" size={15} /> Access is read-only, expires after one hour, and can be removed at any time.</p>
      {notice ? <p className="permission-notice" role="status" aria-live="polite">{notice}</p> : null}
      {permissionCenterRows.length === 0 ? (
        <div className="friendly-empty-state">
          <strong>No saved info yet</strong>
          <p>Add your first note and this page will show which agents can use it.</p>
          <button onClick={onAddPrivateInfo} type="button"><FilePlus aria-hidden="true" size={16} /> Add info</button>
        </div>
      ) : null}
      {requestedRows.length ? (
        <section className="permission-group" aria-label="Requested private info">
          <div className="panel-title">This Agent Wants To Use</div>
          {requestedRows.map(renderPermissionRow)}
        </section>
      ) : permissionCenterRows.length ? (
        <div className="friendly-empty-state compact-empty-state">
          <strong>No access needed right now</strong>
          <p>This agent is not asking to use saved info.</p>
        </div>
      ) : null}
      {otherRows.length ? (
        <details className="permission-group permission-secondary-group">
          <summary>Other saved info</summary>
          {otherRows.map(renderPermissionRow)}
        </details>
      ) : null}
    </div>
  );
}
