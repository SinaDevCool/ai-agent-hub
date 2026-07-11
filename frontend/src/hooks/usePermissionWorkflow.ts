import { useMemo, useState } from "react";
import { apiDelete, apiPost } from "../api/client";
import type { Agent, VaultSchema } from "../api/types";

type ConfirmationDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger";
  onConfirm: () => Promise<void> | void;
};

export type PermissionReviewItem = {
  schema?: VaultSchema;
  schemaName: string;
  granted: boolean;
};

type UsePermissionWorkflowInput = {
  agents: Agent[];
  schemas: VaultSchema[];
  selectedAgent: Agent | undefined;
  refresh: () => Promise<unknown>;
  setConfirmation: (confirmation: ConfirmationDialog) => void;
  setSelectedAgentId: (updater: string | ((current: string) => string)) => void;
  setToolResult: (value: string) => void;
};

const grantDuration: string = "3600000";

export function usePermissionWorkflow(input: UsePermissionWorkflowInput) {
  const { agents, schemas, selectedAgent, refresh, setConfirmation, setSelectedAgentId, setToolResult } = input;
  const [grantingSchemaName, setGrantingSchemaName] = useState("");

  const permissionReview = useMemo(() => {
    if (!selectedAgent) return [];
    const requestedSchemas = selectedAgent.capabilityManifest.requestedSchemas ?? [];
    const grantedSchemaIds = new Set(
      selectedAgent.permissions
        .filter((permission) => permission.permissionType === "read" && permission.vaultSchemaId)
        .map((permission) => permission.vaultSchemaId)
    );
    return requestedSchemas.map((schemaName) => {
      const schema = schemas.find((item) => item.name === schemaName);
      return {
        schema,
        schemaName,
        granted: Boolean(schema?.id && grantedSchemaIds.has(schema.id))
      };
    });
  }, [schemas, selectedAgent]);

  const ungrantedRequestedSchemas = useMemo(
    () => permissionReview.filter((item) => item.schema && !item.granted),
    [permissionReview]
  );

  const allowedPermissionCount = permissionReview.filter((item) => item.granted).length;
  const selectedReadableInfo = permissionReview.filter((item) => item.granted).map((item) => item.schemaName);

  const permissionCenterRows = useMemo(() => schemas.map((schema) => ({
    schema,
    allowedAgents: agents.filter((agent) => agent.permissions.some((permission) => permission.vaultSchemaId === schema.id && permission.permissionType === "read")),
    requestingAgents: agents.filter((agent) => (agent.capabilityManifest.requestedSchemas ?? []).includes(schema.name))
  })), [agents, schemas]);

  async function togglePermission(schema: VaultSchema, enabled: boolean) {
    if (!selectedAgent) return;
    await apiPost("/api/permissions/clearance", {
      agentId: selectedAgent.id,
      vaultSchemaId: schema.id,
      permissionType: "read",
      enabled,
      restrictionRules: { deniedPaths: [], maxRecords: 8, uiGranted: true },
      expiresAt: enabled && grantDuration !== "always" ? new Date(Date.now() + Number(grantDuration)).toISOString() : undefined
    });
    await refresh();
  }

  async function grantRequestedSchema(schema: VaultSchema) {
    setGrantingSchemaName(schema.name);
    try {
      await togglePermission(schema, true);
      setToolResult(`${selectedAgent?.name ?? "This helper"} can now read ${schema.name}.`);
    } finally {
      setGrantingSchemaName("");
    }
  }

  async function grantAllRequestedSchemas() {
    if (ungrantedRequestedSchemas.length === 0) return;
    setGrantingSchemaName("all");
    try {
      for (const item of ungrantedRequestedSchemas) {
        if (item.schema) await togglePermission(item.schema, true);
      }
      setToolResult(`${selectedAgent?.name ?? "This helper"} can now read ${ungrantedRequestedSchemas.length} approved info categories.`);
    } finally {
      setGrantingSchemaName("");
    }
  }

  async function revokeSelectedAgentAccessNow() {
    if (!selectedAgent) return;
    const readPermissions = selectedAgent.permissions.filter((permission) => permission.vaultSchema);
    for (const permission of readPermissions) {
      if (permission.vaultSchema) await togglePermission(permission.vaultSchema, false);
    }
    setToolResult(`All readable personal info access was revoked for ${selectedAgent.name}.`);
  }

  function revokeSelectedAgentAccess() {
    if (!selectedAgent) return;
    setConfirmation({
      title: "Revoke this helper's access?",
      message: `${selectedAgent.name} will lose access to every private info category you allowed.`,
      confirmLabel: "Revoke access",
      tone: "danger",
      onConfirm: revokeSelectedAgentAccessNow
    });
  }

  async function revokeAllAgentAccessNow() {
    for (const agent of agents) {
      for (const permission of agent.permissions.filter((item) => item.vaultSchema)) {
        if (permission.vaultSchema) {
          await apiPost("/api/permissions/clearance", {
            agentId: agent.id,
            vaultSchemaId: permission.vaultSchema.id,
            permissionType: "read",
            enabled: false,
            restrictionRules: {}
          });
        }
      }
    }
    await refresh();
    setToolResult("All helper access to saved info was removed.");
  }

  function revokeAllAgentAccess() {
    setConfirmation({
      title: "Remove all helper access?",
      message: "Helpers will stop using saved info until you allow access again.",
      confirmLabel: "Remove all access",
      tone: "danger",
      onConfirm: revokeAllAgentAccessNow
    });
  }

  function removeAgentFromProfile(agent: Agent) {
    setConfirmation({
      title: "Remove this helper?",
      message: `${agent.name} will be removed from your profile and lose access to your private info. Your saved private notes stay safe.`,
      confirmLabel: "Remove helper",
      tone: "danger",
      onConfirm: async () => {
        await apiDelete(`/api/agents/${agent.id}`);
        setToolResult(`${agent.name} was removed from your profile.`);
        setSelectedAgentId((current) => current === agent.id ? "" : current);
        await refresh();
      }
    });
  }

  return {
    allowedPermissionCount,
    grantingSchemaName,
    grantAllRequestedSchemas,
    grantRequestedSchema,
    permissionCenterRows,
    permissionReview,
    removeAgentFromProfile,
    revokeAllAgentAccess,
    revokeSelectedAgentAccess,
    selectedReadableInfo,
    togglePermission,
    ungrantedRequestedSchemas
  };
}
