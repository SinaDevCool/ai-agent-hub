import { useCallback, useState } from "react";
import {
  createWorkflowConnection,
  deleteWorkflowConnection,
  listWorkflowCapabilities,
  listWorkflowConnections,
  testWorkflowConnection,
  updateWorkflowConnection
} from "../api/workflows";
import type { WorkflowCapability, WorkflowConnection, WorkflowConnectionInput, WorkflowConnectionStatus, WorkflowResultCard } from "../api/types";

export function useWorkflows(input: { formatError: (error: unknown) => string }) {
  const [workflows, setWorkflows] = useState<WorkflowConnection[]>([]);
  const [capabilities, setCapabilities] = useState<WorkflowCapability[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastSigningSecret, setLastSigningSecret] = useState("");
  const [lastTestPreview, setLastTestPreview] = useState<{ workflowId: string; result: WorkflowResultCard | null; reason?: string } | null>(null);

  const refreshWorkflows = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await listWorkflowConnections();
      setWorkflows(result.workflows);
      const capabilityResult = await listWorkflowCapabilities();
      setCapabilities(capabilityResult.capabilities);
      return true;
    } catch (refreshError) {
      setError(input.formatError(refreshError));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [input]);

  async function createWorkflow(payload: WorkflowConnectionInput) {
    setIsSaving(true);
    setError("");
    setMessage("");
    setLastSigningSecret("");
    try {
      const result = await createWorkflowConnection(payload);
      setLastSigningSecret(result.signingSecret);
      setMessage("Workflow saved. Add the signing secret to your automation tool, then test it.");
      await refreshWorkflows();
      return result.workflow;
    } catch (createError) {
      setError(input.formatError(createError));
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function testWorkflow(workflowId: string) {
    setIsSaving(true);
    setError("");
    setMessage("");
    setLastTestPreview(null);
    try {
      const result = await testWorkflowConnection(workflowId);
      setLastTestPreview({
        workflowId,
        result: result.ok ? result.result.workflowResult ?? null : null,
        reason: result.ok ? undefined : result.reason
      });
      setMessage(result.ok ? "Workflow test passed. Agents can use it now." : result.reason);
      await refreshWorkflows();
      return result.ok;
    } catch (testError) {
      setError(input.formatError(testError));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function setWorkflowStatus(workflowId: string, status: WorkflowConnectionStatus) {
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      await updateWorkflowConnection(workflowId, { status });
      setMessage(status === "disabled" ? "Workflow disabled." : "Workflow updated.");
      await refreshWorkflows();
      return true;
    } catch (updateError) {
      setError(input.formatError(updateError));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteWorkflow(workflowId: string) {
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      await deleteWorkflowConnection(workflowId);
      setMessage("Workflow removed.");
      await refreshWorkflows();
      return true;
    } catch (deleteError) {
      setError(input.formatError(deleteError));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  return {
    error,
    capabilities,
    isLoading,
    isSaving,
    lastSigningSecret,
    lastTestPreview,
    message,
    workflows,
    createWorkflow,
    deleteWorkflow,
    refreshWorkflows,
    setMessage,
    setWorkflowStatus,
    testWorkflow
  };
}
