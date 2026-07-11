import type { Agent, HitlRequest, VaultSchema } from "../api/types";
import { friendlyActionName } from "./display";
import { testHelperPattern } from "./appCatalog";

export type HelperPrompt = {
  label: string;
  prompt: string;
  detail: string;
  tone: "info" | "safe" | "approval";
};

export function friendlyTrustLabel(score: number) {
  if (score >= 90) return "Very trusted";
  if (score >= 80) return "Trusted";
  return "Safety reviewed";
}

export function approvalReason(action: string) {
  const lower = action.toLowerCase();
  if (/book|reserve|travel/.test(lower)) return "This may spend money or create a non-refundable booking.";
  if (/transfer|pay|payment|credit|purchase|buy/.test(lower)) return "This may move money, make a purchase, or affect your finances.";
  if (/medical|health/.test(lower)) return "This may share sensitive health information.";
  if (/send|email|share/.test(lower)) return "This may send or share information outside your account.";
  return "This is a sensitive action, so the helper must pause for your approval.";
}

export function approvalPlainSentence(action: string) {
  return `This helper wants to ${friendlyActionName(action)}.`;
}

export function agentCannotDo(agent: Agent | undefined) {
  if (!agent) return ["Act without your approval"];
  const rules = ["Read private info you have not allowed"];
  if (agent.capabilityManifest.highRiskActions?.length) {
    rules.push("Continue risky actions until you approve them");
  }
  if (!agent.capabilityManifest.tools?.includes("email.draft")) {
    rules.push("Send emails from your account");
  }
  if (!agent.capabilityManifest.tools?.includes("action.execute")) {
    rules.push("Take real-world actions");
  }
  return Array.from(new Set(rules));
}

export function isTestHelper(agent: Pick<Agent, "name" | "capabilityManifest">) {
  return testHelperPattern.test(agent.name) || testHelperPattern.test(agent.capabilityManifest.description ?? "");
}

export function agentReadiness(agent: Agent | undefined, missingCount: number, pendingApprovalCount: number) {
  if (!agent) {
    return {
      tone: "red" as const,
      label: "No helper selected",
      detail: "Choose a helper to start."
    };
  }
  if (pendingApprovalCount > 0) {
    return {
      tone: "amber" as const,
      label: "Waiting for you",
      detail: `${pendingApprovalCount} action${pendingApprovalCount === 1 ? " is" : "s are"} paused. Nothing continues unless you allow it.`
    };
  }
  if (missingCount > 0) {
    return {
      tone: "amber" as const,
      label: "Needs access",
      detail: "Allow the requested private info before this helper can answer well."
    };
  }
  return {
    tone: "green" as const,
    label: "Ready",
    detail: "This helper can answer using only the info you approved."
  };
}

export function promptSuggestions(agent: Agent | undefined): HelperPrompt[] {
  const category = agent?.category.toLowerCase() ?? "";
  if (category.includes("travel")) return [
    { label: "Check my preferences", prompt: "What travel preferences do you know about me?", detail: "Reads only approved travel notes.", tone: "info" },
    { label: "Plan safely", prompt: "Plan a weekend trip using my saved preferences", detail: "Uses saved info, no booking yet.", tone: "safe" },
    { label: "Check approval", prompt: "Book a non-refundable trip", detail: "Should pause before booking.", tone: "approval" }
  ];
  if (category.includes("financial")) return [
    { label: "Find my rule", prompt: "What spending rule should I follow?", detail: "Looks up approved money notes.", tone: "info" },
    { label: "Use preferences", prompt: "Find my payment preferences", detail: "Shows what info was used.", tone: "safe" },
    { label: "Check approval", prompt: "Transfer money for this purchase", detail: "Should pause before money moves.", tone: "approval" }
  ];
  if (category.includes("wellness")) return [
    { label: "Summarize notes", prompt: "Summarize my saved health notes", detail: "Uses approved health notes only.", tone: "info" },
    { label: "Check access", prompt: "What health info can you access?", detail: "Explains allowed private info.", tone: "safe" },
    { label: "Check approval", prompt: "Share my medical record", detail: "Should pause before sharing.", tone: "approval" }
  ];
  return [
    { label: "Start simple", prompt: "What can you help me with?", detail: "No risky action.", tone: "info" },
    { label: "Find info", prompt: "Find the private info you can use", detail: "Uses approved notes only.", tone: "safe" },
    { label: "Check approval", prompt: "Try an action that should pause first", detail: "Shows the approval pause.", tone: "approval" }
  ];
}

export function promptRiskPreview(prompt: string, agent: Agent | undefined, missingPermissions: number, pendingApprovals: number) {
  const cleanPrompt = prompt.trim();
  if (pendingApprovals > 0) {
    return {
      tone: "amber" as const,
      label: "Waiting for you",
      detail: "A sensitive action is paused. Nothing continues unless you allow it."
    };
  }
  if (!cleanPrompt) {
    return {
      tone: "blue" as const,
      label: "Ready when you are",
      detail: "Choose a starter or type what you want this helper to do."
    };
  }
  if (/\b(book|buy|purchase|transfer|pay|reserve|send|share|sign|execute|apply|open)\b/i.test(cleanPrompt)) {
    return {
      tone: "amber" as const,
      label: "Will ask first",
      detail: `${agent?.name ?? "This helper"} should pause before taking a sensitive action.`
    };
  }
  if (missingPermissions > 0) {
    return {
      tone: "amber" as const,
      label: "May need access",
      detail: "The answer may be limited until you allow the requested private info."
    };
  }
  return {
    tone: "green" as const,
    label: "Safe to send",
    detail: "This should answer using only private info you already allowed."
  };
}

export function permissionProgress(agent: Agent | undefined, schemas: VaultSchema[]) {
  if (!agent) return { allowed: 0, requested: 0, missing: 0 };
  const requested = agent.capabilityManifest.requestedSchemas ?? [];
  const grantedSchemaIds = new Set(
    agent.permissions
      .filter((permission) => permission.permissionType === "read" && permission.vaultSchemaId)
      .map((permission) => permission.vaultSchemaId)
  );
  const allowed = requested.filter((schemaName) => {
    const schema = schemas.find((item) => item.name === schemaName);
    return Boolean(schema?.id && grantedSchemaIds.has(schema.id));
  }).length;
  return { allowed, requested: requested.length, missing: Math.max(requested.length - allowed, 0) };
}

export type AgentReadiness = ReturnType<typeof agentReadiness>;

export function agentReadinessFor(agent: Agent | undefined, schemas: VaultSchema[], approvals: HitlRequest[]): AgentReadiness {
  const progress = permissionProgress(agent, schemas);
  const pendingCount = agent ? approvals.filter((request) => request.agent.id === agent.id).length : 0;
  return agentReadiness(agent, progress.missing, pendingCount);
}
