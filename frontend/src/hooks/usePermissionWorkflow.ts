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
  formatError: (error: unknown) => string;
  schemas: VaultSchema[];
  selectedAgent: Agent | undefined;
  refresh: () => Promise<unknown>;
  setConfirmation: (confirmation: ConfirmationDialog) => void;
  setSelectedAgentId: (updater: string | ((current: string) => string)) => void;
  setToolResult: (value: string) => void;
};

const grantDuration: string = "3600000";

export function usePermissionWorkflow(input: UsePermissionWorkflowInput) {
  const { agents, formatError, schemas, selectedAgent, refresh, setConfirmation, setSelectedAgentId, setToolResult } = input;
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

  async function updatePermission(schema: VaultSchema, enabled: boolean) {
    if (!selectedAgent) return;
    await apiPost("/api/permissions/clearance", {
      agentId: selectedAgent.id,
      vaultSchemaId: schema.id,
      permissionType: "read",
      enabled,
      restrictionRules: { deniedPaths: [], maxRecords: 8, uiGranted: true },
      expiresAt: enabled && grantDuration !== "always" ? new Date(Date.now() + Number(grantDuration)).toISOString() : undefined
    });
  }

  async function togglePermission(schema: VaultSchema, enabled: boolean) {
    setGrantingSchemaName(schema.name);
    try {
      await updatePermission(schema, enabled);
      await refresh();
      setToolResult(enabled
        ? `${selectedAgent?.name ?? "This agent"} can now read ${schema.name}.`
        : `${selectedAgent?.name ?? "This agent"} can no longer read ${schema.name}.`
      );
    } catch (error) {
      setToolResult(formatError(error));
    } finally {
      setGrantingSchemaName("");
    }
  }

  async function grantRequestedSchema(schema: VaultSchema) {
    setGrantingSchemaName(schema.name);
    try {
      await updatePermission(schema, true);
      await refresh();
      setToolResult(`${selectedAgent?.name ?? "This agent"} can now read ${schema.name}.`);
    } catch (error) {
      setToolResult(formatError(error));
    } finally {
      setGrantingSchemaName("");
    }
  }

  async function grantAllRequestedSchemas() {
    if (ungrantedRequestedSchemas.length === 0) return;
    setGrantingSchemaName("all");
    try {
      for (const item of ungrantedRequestedSchemas) {
        if (item.schema) await updatePermission(item.schema, true);
      }
      await refresh();
      setToolResult(`${selectedAgent?.name ?? "This agent"} can now read ${ungrantedRequestedSchemas.length} approved info categories.`);
    } catch (error) {
      setToolResult(formatError(error));
    } finally {
      setGrantingSchemaName("");
    }
  }

  async function revokeSelectedAgentAccessNow() {
    if (!selectedAgent) return;
    const grantedSchemas = permissionReview.filter((item) => item.granted && item.schema).map((item) => item.schema!);
    if (grantedSchemas.length === 0) {
      setToolResult(`${selectedAgent.name} has no saved info access to remove.`);
      return;
    }
    setGrantingSchemaName("all");
    try {
      for (const schema of grantedSchemas) {
        await updatePermission(schema, false);
      }
      await refresh();
      setToolResult(`All saved info access was removed for ${selectedAgent.name}.`);
    } catch (error) {
      setToolResult(formatError(error));
    } finally {
      setGrantingSchemaName("");
    }
  }

  function revokeSelectedAgentAccess() {
    if (!selectedAgent) return "none";
    if (!permissionReview.some((item) => item.granted)) {
      setToolResult(`${selectedAgent.name} has no saved info access to remove.`);
      return "none";
    }
    setConfirmation({
      title: "Revoke this agent's access?",
      message: `${selectedAgent.name} will lose access to every private info category you allowed.`,
      confirmLabel: "Revoke access",
      tone: "danger",
      onConfirm: revokeSelectedAgentAccessNow
    });
    return "confirm";
  }

  async function revokeAllAgentAccessNow() {
    setGrantingSchemaName("all");
    try {
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
      setToolResult("All agent access to saved info was removed.");
    } catch (error) {
      setToolResult(formatError(error));
    } finally {
      setGrantingSchemaName("");
    }
  }

  function revokeAllAgentAccess() {
    setConfirmation({
      title: "Remove all agent access?",
      message: "Agents will stop using saved info until you allow access again.",
      confirmLabel: "Remove all access",
      tone: "danger",
      onConfirm: revokeAllAgentAccessNow
    });
  }

  function removeAgentFromProfile(agent: Agent) {
    setConfirmation({
      title: "Remove this agent?",
      message: `${agent.name} will be removed from your profile and lose access to your private info. Your saved private notes stay safe.`,
      confirmLabel: "Remove agent",
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
