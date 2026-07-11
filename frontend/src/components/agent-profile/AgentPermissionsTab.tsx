import { KeyRound } from "lucide-react";
import type { VaultSchema } from "../../api/types";
import { StatusPill } from "../StatusPill";
import type { PermissionReviewItem } from "./agentProfileTypes";

type AgentPermissionsTabProps = {
  allowedPermissionCount: number;
  grantAllRequestedSchemas: () => void | Promise<void>;
  grantRequestedSchema: (schema: VaultSchema) => void | Promise<void>;
  grantingSchemaName: string;
  permissionReview: PermissionReviewItem[];
  selectedIsExternal: boolean;
  togglePermission: (schema: VaultSchema, enabled: boolean) => void | Promise<void>;
  ungrantedRequestedSchemas: PermissionReviewItem[];
};

export function AgentPermissionsTab(props: AgentPermissionsTabProps) {
  const {
    allowedPermissionCount,
    grantAllRequestedSchemas,
    grantRequestedSchema,
    grantingSchemaName,
    permissionReview,
    selectedIsExternal,
    togglePermission,
    ungrantedRequestedSchemas
  } = props;

  return (
    <section className="agent-tab-panel" aria-label="Helper permissions">
      {permissionReview.length ? (
        <div className="mobile-permission-summary">
          <strong>This helper wants {permissionReview.length} saved info categor{permissionReview.length === 1 ? "y" : "ies"}.</strong>
          <span>{ungrantedRequestedSchemas.length ? `${ungrantedRequestedSchemas.length} still need access.` : "All requested saved info is allowed."}</span>
          <button disabled={ungrantedRequestedSchemas.length === 0 || grantingSchemaName === "all"} onClick={() => void grantAllRequestedSchemas()} type="button">
            <KeyRound aria-hidden="true" size={16} /> Allow requested info
          </button>
        </div>
      ) : null}
      <div className="permission-review-header">
        <div>
          <strong>Saved info this helper can use</strong>
          <span>{selectedIsExternal ? "Only approved snippets can be shared through AI Agent Hub safety." : `${allowedPermissionCount} of ${permissionReview.length} requested categories allowed`}</span>
        </div>
        <button disabled={ungrantedRequestedSchemas.length === 0 || grantingSchemaName === "all"} onClick={() => void grantAllRequestedSchemas()} type="button">
          <KeyRound aria-hidden="true" size={16} /> Allow requested info
        </button>
      </div>
      {permissionReview.length === 0 ? (
        <p className="empty">This helper is not asking to use saved info.</p>
      ) : permissionReview.map((item) => (
        <div className="permission-review-row" key={item.schemaName}>
          <div>
            <strong>{item.schemaName}</strong>
            <small>{item.schema?.description ?? "Unknown info category"}</small>
          </div>
          <StatusPill tone={item.granted ? "green" : item.schema ? "amber" : "red"}>{item.granted ? "allowed" : item.schema ? "needs access" : "missing"}</StatusPill>
          {item.schema && item.granted ? (
            <button onClick={() => void togglePermission(item.schema!, false)} type="button">Remove access</button>
          ) : (
            <button disabled={!item.schema || grantingSchemaName === item.schemaName || grantingSchemaName === "all"} onClick={() => item.schema ? void grantRequestedSchema(item.schema) : undefined} type="button">
              {selectedIsExternal ? "Allow snippets" : "Allow"}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
