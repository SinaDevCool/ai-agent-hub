import { FilePlus } from "lucide-react";
import type { Agent, VaultSchema } from "../api/types";
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
    onTogglePermission
  } = props;

  return (
    <div className={className} id="clearance">
      <div className="panel-heading-row">
        <div>
          <div className="panel-title">Permissions</div>
          <p className="mobile-section-intro">Choose what {selectedAgent?.name ?? "this helper"} can read. You can change this anytime.</p>
        </div>
        <StatusPill tone={ungrantedRequestedCount ? "amber" : "green"}>
          {ungrantedRequestedCount ? `${ungrantedRequestedCount} needs review` : "all clear"}
        </StatusPill>
      </div>
      <div className="permission-center-summary">
        <div><strong>{selectedAgent?.name ?? "Selected helper"}</strong><span>Selected helper</span></div>
        <div><strong>{allowedPermissionCount}</strong><span>Allowed categories</span></div>
        <div><strong>{approvalCount}</strong><span>Approvals waiting</span></div>
      </div>
      {permissionCenterRows.length === 0 ? (
        <div className="friendly-empty-state">
          <strong>No private info categories yet</strong>
          <p>Add your first private note and this page will show exactly which helpers can use it.</p>
          <button onClick={onAddPrivateInfo} type="button"><FilePlus size={16} /> Add Private Info</button>
        </div>
      ) : null}
      {permissionCenterRows.map(({ schema, allowedAgents, requestingAgents }) => {
        const granted = Boolean(selectedAgent?.permissions.some((permission) => permission.vaultSchemaId === schema.id && permission.permissionType === "read"));
        const selectedRequestsThis = Boolean(selectedAgent?.capabilityManifest.requestedSchemas?.includes(schema.name));
        const allowedSummary = allowedAgents.length
          ? `${allowedAgents.length} helper${allowedAgents.length === 1 ? "" : "s"} can read this category.`
          : "No helper can read this category yet.";
        const requestSummary = requestingAgents.length
          ? `${requestingAgents.length} helper${requestingAgents.length === 1 ? "" : "s"} may ask for this category.`
          : "";
        return (
          <div className="clearance-row permission-category-row" key={schema.id}>
            <label>
              <input type="checkbox" checked={granted} onChange={(event) => void onTogglePermission(schema, event.currentTarget.checked)} />
              <span>{granted ? "Allowed" : selectedRequestsThis ? "Requested" : "Not allowed"}</span>
            </label>
            <div>
              <strong>{schema.name}</strong>
              <small>{schema.description}</small>
              <small>{selectedRequestsThis ? `${selectedAgent?.name ?? "This helper"} requested this.` : `${selectedAgent?.name ?? "This helper"} has not requested this.`}</small>
              <small>{allowedSummary}</small>
              {requestSummary ? <small>{requestSummary}</small> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
