import type { ActivityActionType, ActivityStatus } from "@prisma/client";
import { friendlyActionName } from "./runtimeIntentService.js";

export type RuntimeActivityDisplay = {
  title: string;
  summary: string;
  badge: string;
  category: "private_info" | "approval" | "provider" | "agent_management" | "system";
  nextStep?: string;
  agentName?: string;
  privateInfoUsed: string[];
  externalService?: string;
  approvalStatus?: "waiting" | "allowed" | "denied";
};

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function badgeForStatus(status: ActivityStatus) {
  if (status === "success") return "Done";
  if (status === "pending_human_approval") return "Waiting for you";
  if (status === "blocked_by_policy") return "Blocked";
  return titleCase(status);
}

function eventCategory(actionType: ActivityActionType): RuntimeActivityDisplay["category"] {
  if (actionType === "vault_read" || actionType === "vault_write" || actionType === "permission_requested") return "private_info";
  if (actionType === "hitl_requested" || actionType === "hitl_approved" || actionType === "hitl_denied") return "approval";
  if (actionType === "execution_triggered" || actionType === "api_callback") return "provider";
  if (actionType === "agent_created" || actionType === "agent_removed") return "agent_management";
  return "system";
}

function actionLabel(dataAccessed?: string | null, metadata?: Record<string, unknown>) {
  const value = asString(metadata?.actionName) ?? asString(dataAccessed) ?? "this action";
  return friendlyActionName(value);
}

export function buildRuntimeActivityDisplay(input: {
  actionType: ActivityActionType;
  status: ActivityStatus;
  dataAccessed?: string | null;
  metadata: Record<string, unknown>;
  agentName?: string;
}): RuntimeActivityDisplay {
  const explicitTitle = asString(input.metadata.userTitle);
  const explicitSummary = asString(input.metadata.userSummary);
  const explicitNextStep = asString(input.metadata.nextStep);
  const category = eventCategory(input.actionType);
  const agentName = input.agentName ?? asString(input.metadata.agentName) ?? "Agent";
  const badge = asString(input.metadata.statusLabel) ?? badgeForStatus(input.status);
  const privateInfoUsed = asStringArray(input.metadata.privateInfoUsed);
  const externalService = asString(input.metadata.externalService);

  if (explicitTitle && explicitSummary) {
    return {
      title: explicitTitle,
      summary: explicitSummary,
      badge,
      category,
      nextStep: explicitNextStep,
      agentName,
      privateInfoUsed,
      externalService,
      approvalStatus: input.metadata.approvalStatus as RuntimeActivityDisplay["approvalStatus"]
    };
  }

  if (input.actionType === "vault_read") {
    const allowed = input.status === "success";
    return {
      title: allowed ? `${agentName} read private info` : `${agentName} could not read private info`,
      summary: allowed
        ? `${agentName} used only the private info you allowed.`
        : `${agentName} needs access before it can use that private info.`,
      badge,
      category,
      nextStep: allowed ? "Review Activity if you want to see what was used." : "Review and allow the requested private info.",
      agentName,
      privateInfoUsed: privateInfoUsed.length ? privateInfoUsed : [asString(input.dataAccessed) ?? "Private info"]
    };
  }

  if (input.actionType === "permission_requested") {
    const granted = input.status === "success";
    return {
      title: granted ? "Private info access allowed" : "Private info access removed",
      summary: granted
        ? `${agentName} can now use this private info when needed.`
        : `${agentName} can no longer use this private info.`,
      badge,
      category,
      nextStep: granted ? "Ask the agent again." : "Allow access again if you want this agent to use it later.",
      agentName,
      privateInfoUsed: privateInfoUsed.length ? privateInfoUsed : [asString(input.dataAccessed) ?? "Private info"]
    };
  }

  if (input.actionType === "hitl_requested") {
    const label = actionLabel(input.dataAccessed, input.metadata);
    return {
      title: `${agentName} paused before ${label}`,
      summary: "This needs your approval before anything continues.",
      badge,
      category,
      nextStep: "Allow once or deny.",
      agentName,
      privateInfoUsed,
      externalService,
      approvalStatus: "waiting"
    };
  }

  if (input.actionType === "hitl_approved" || input.actionType === "hitl_denied") {
    const approved = input.actionType === "hitl_approved";
    return {
      title: approved ? "You allowed this once" : "You denied this action",
      summary: approved
        ? `${agentName} may continue the approved action one time.`
        : `${agentName} will not continue this action.`,
      badge,
      category,
      nextStep: approved ? "Continue the approved action before it expires." : "Create a new request if you change your mind.",
      agentName,
      privateInfoUsed,
      externalService,
      approvalStatus: approved ? "allowed" : "denied"
    };
  }

  if (input.actionType === "execution_triggered") {
    const label = actionLabel(input.dataAccessed, input.metadata);
    return {
      title: `${agentName} completed ${label}`,
      summary: "The action is recorded in your activity history.",
      badge,
      category,
      nextStep: "Review receipts for details.",
      agentName,
      privateInfoUsed,
      externalService
    };
  }

  if (input.actionType === "agent_removed") {
    return {
      title: "Agent removed",
      summary: `${asString(input.dataAccessed) ?? agentName} was removed from your profile.`,
      badge,
      category,
      nextStep: "Add it again from Agent Pool if you need it later.",
      agentName,
      privateInfoUsed: []
    };
  }

  return {
    title: titleCase(input.actionType),
    summary: asString(input.metadata.reason) ?? "This event was recorded in your activity history.",
    badge,
    category,
    nextStep: explicitNextStep,
    agentName,
    privateInfoUsed,
    externalService
  };
}
