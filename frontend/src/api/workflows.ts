import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type {
  WorkflowConnection,
  WorkflowCapability,
  WorkflowConnectionInput,
  WorkflowConnectionStatus,
  WorkflowCreateResponse,
  WorkflowTestResponse
} from "./types";

export function listWorkflowConnections() {
  return apiGet<{ workflows: WorkflowConnection[] }>("/api/workflows");
}

export function listWorkflowCapabilities() {
  return apiGet<{ capabilities: WorkflowCapability[] }>("/api/workflows/capabilities");
}

export function createWorkflowConnection(input: WorkflowConnectionInput) {
  return apiPost<WorkflowCreateResponse>("/api/workflows", input);
}

export function updateWorkflowConnection(
  workflowId: string,
  input: Partial<WorkflowConnectionInput> & { status?: WorkflowConnectionStatus }
) {
  return apiPatch<{ workflow: WorkflowConnection }>(`/api/workflows/${workflowId}`, input);
}

export function deleteWorkflowConnection(workflowId: string) {
  return apiDelete<{ ok: true }>(`/api/workflows/${workflowId}`);
}

export function testWorkflowConnection(workflowId: string) {
  return apiPost<WorkflowTestResponse>(`/api/workflows/${workflowId}/test`);
}
