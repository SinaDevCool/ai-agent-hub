import type { ConnectedAccountStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { ToolDefinition } from "./toolRegistryService.js";
import type { ToolBlockDetails, ToolExecutionInput } from "./tools/toolExecutionTypes.js";

type JsonSchemaLike = {
  required?: unknown;
  properties?: unknown;
};

export type ToolExecutionDecision =
  | { status: "allowed" }
  | { status: "blocked"; details: ToolBlockDetails }
  | { status: "approval_required"; actionName: string; details: ToolBlockDetails };

function schema(inputSchema: Record<string, unknown>): JsonSchemaLike {
  return inputSchema as JsonSchemaLike;
}

function requiredFields(definition: ToolDefinition) {
  const required = schema(definition.inputSchema).required;
  return Array.isArray(required) ? required.filter((item): item is string => typeof item === "string") : [];
}

function missingRequiredFields(definition: ToolDefinition, args: Record<string, unknown>) {
  return requiredFields(definition).filter((field) => {
    const value = args[field];
    if (value === undefined || value === null) return true;
    if (typeof value === "string" && !value.trim()) return true;
    return false;
  });
}

function connectorMessage(provider: string, status?: ConnectedAccountStatus) {
  const label = provider === "office" ? "Google or Microsoft" : provider;
  if (!status) return `Connect ${label} before this agent can use that service.`;
  if (status === "expired") return `Reconnect ${label}. The saved connection has expired.`;
  if (status === "revoked") return `Reconnect ${label}. Access was removed.`;
  if (status === "error") return `Reconnect ${label}. The saved connection needs attention.`;
  return `Connect ${label} before this agent can use that service.`;
}

async function getConnectorStatus(userId: string, provider: string) {
  if (provider === "office") {
    return prisma.connectedAccount.findFirst({ where: { userId, provider: { in: ["google", "microsoft"] }, status: "active" }, orderBy: { updatedAt: "desc" }, select: { status: true, lastError: true } });
  }
  const account = await prisma.connectedAccount.findFirst({
    where: { userId, provider },
    orderBy: { updatedAt: "desc" },
    select: { status: true, lastError: true }
  });
  return account;
}

export function getToolActionName(definition: ToolDefinition, args: Record<string, unknown>) {
  const explicit = typeof args.actionName === "string" ? args.actionName.trim() : "";
  if (explicit) return explicit;
  return definition.name.replace(/\./g, "_");
}

export async function evaluateToolExecutionPolicy(input: {
  definition: ToolDefinition | undefined;
  execution: ToolExecutionInput;
}): Promise<ToolExecutionDecision> {
  const { definition, execution } = input;
  if (!definition) {
    return {
      status: "blocked",
      details: {
        code: "unknown_tool",
        userMessage: "This agent tried to use a tool that is not available.",
        technicalMessage: `Unknown tool '${execution.toolName}'.`,
        nextAction: "contact_support",
        retryable: false
      }
    };
  }

  const missing = missingRequiredFields(definition, execution.arguments);
  if (missing.length) {
    return {
      status: "blocked",
      details: {
        code: "invalid_input",
        userMessage: `This agent needs ${missing.join(", ")} before it can continue.`,
        technicalMessage: `Missing required input fields: ${missing.join(", ")}.`,
        nextAction: "try_again",
        retryable: true
      }
    };
  }

  if (definition.requiredConnector) {
    const connector = await getConnectorStatus(execution.userId, definition.requiredConnector);
    if (!connector || connector.status !== "active") {
      return {
        status: "blocked",
        details: {
          code: connector?.status === "expired" ? "connector_expired" : "connector_not_connected",
          userMessage: connectorMessage(definition.requiredConnector, connector?.status),
          technicalMessage: connector?.lastError ?? undefined,
          nextAction: "connect_account",
          retryable: true
        }
      };
    }
  }

  if (definition.requiresApproval && !execution.approvalOverride) {
    return {
      status: "approval_required",
      actionName: getToolActionName(definition, execution.arguments),
      details: {
        code: "approval_required",
        userMessage: "This action needs your approval before the agent can do it.",
        technicalMessage: `${definition.name} is marked as approval-required.`,
        nextAction: "approve_action",
        retryable: true
      }
    };
  }

  return { status: "allowed" };
}

export function normalizeToolBlock(input: { reason: string } & Partial<ToolBlockDetails>): ToolBlockDetails {
  if (input.code && input.userMessage) {
    return {
      code: input.code,
      userMessage: input.userMessage,
      technicalMessage: input.technicalMessage,
      nextAction: input.nextAction,
      retryable: input.retryable
    };
  }
  const reason = input.reason;
  if (/agent connection token has expired/i.test(reason)) {
    return {
      code: "connector_expired",
      userMessage: "Reconnect this agent before trying again.",
      technicalMessage: reason,
      nextAction: "connect_account",
      retryable: true
    };
  }
  if (/not connected|connect an account|connect google|reconnect/i.test(reason)) {
    return {
      code: /expired|reconnect/i.test(reason) ? "connector_expired" : "connector_not_connected",
      userMessage: reason,
      technicalMessage: input.technicalMessage,
      nextAction: "connect_account",
      retryable: true
    };
  }
  if (/permission|allow|access/i.test(reason)) {
    return {
      code: "permission_denied",
      userMessage: reason,
      technicalMessage: input.technicalMessage,
      nextAction: "grant_access",
      retryable: true
    };
  }
  if (/connect a workflow|no workflow|workflow is disabled|test and activate this workflow/i.test(reason)) {
    return {
      code: "provider_error",
      userMessage: reason,
      technicalMessage: input.technicalMessage,
      nextAction: "fix_workflow",
      retryable: true
    };
  }
  if (/unsafe|localhost|https/i.test(reason)) {
    return {
      code: "unsafe_external_url",
      userMessage: "This workflow endpoint is not safe to use. Update it to a secure public HTTPS URL.",
      technicalMessage: reason,
      nextAction: "fix_workflow",
      retryable: true
    };
  }
  if (/HTTP \d{3}|provider|webhook|workflow/i.test(reason)) {
    return {
      code: "provider_error",
      userMessage: "The connected service did not complete the request. Try again or check the connection setup.",
      technicalMessage: reason,
      nextAction: "try_again",
      retryable: true
    };
  }
  if (/not implemented|intentionally disabled/i.test(reason)) {
    return {
      code: "adapter_not_implemented",
      userMessage: "This capability is registered but not fully connected yet.",
      technicalMessage: reason,
      nextAction: "contact_support",
      retryable: false
    };
  }
  return {
    code: "execution_failed",
    userMessage: "The agent could not complete this step.",
    technicalMessage: reason,
    nextAction: "try_again",
    retryable: true
  };
}
