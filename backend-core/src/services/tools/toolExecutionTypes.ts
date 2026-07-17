import type { ToolDefinition } from "../toolRegistryService.js";

export type ToolExecutionInput = {
  userId: string;
  agentId: string;
  agentRunId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  idempotencyKey?: string;
  approvalOverride?: {
    hitlRequestId: string;
  };
};

export type ToolBlockCode =
  | "unknown_tool"
  | "invalid_input"
  | "connector_not_connected"
  | "connector_expired"
  | "approval_required"
  | "permission_denied"
  | "provider_unavailable"
  | "provider_error"
  | "adapter_not_implemented"
  | "unsafe_external_url"
  | "execution_failed";

export type ToolBlockDetails = {
  code: ToolBlockCode;
  userMessage: string;
  technicalMessage?: string;
  nextAction?: "connect_account" | "approve_action" | "fix_workflow" | "grant_access" | "add_missing_info" | "try_again" | "contact_support";
  retryable?: boolean;
};

export type ToolExecutionResult =
  | { status: "ok"; toolRunId: string; documents?: unknown[]; actionName?: string; result?: Record<string, unknown> }
  | ({ status: "blocked"; toolRunId: string; reason: string } & Partial<ToolBlockDetails>)
  | { status: "awaiting_human_approval"; toolRunId: string; requestId: string };

export type AdapterExecutionInput = ToolExecutionInput & {
  toolRunId: string;
  definition: ToolDefinition;
};

export type AdapterExecutionResult =
  | { status: "ok"; documents?: unknown[]; actionName?: string; result?: Record<string, unknown> }
  | ({ status: "blocked"; reason: string } & Partial<ToolBlockDetails>)
  | { status: "awaiting_human_approval"; requestId: string };

export type ToolAdapter = {
  type: ToolDefinition["adapterType"];
  canHandle(definition: ToolDefinition): boolean;
  execute(input: AdapterExecutionInput): Promise<AdapterExecutionResult>;
};
