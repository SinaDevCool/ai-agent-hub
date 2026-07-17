import type { RuntimeAgent, RuntimeResult } from "./agentRuntimeTypes.js";
import { friendlyActionName } from "./runtimeIntentService.js";

export type RuntimeChatDisplay = {
  title: string;
  body: string;
  badge: string;
  tone: "blue" | "amber" | "green" | "red";
  category: "answer" | "permission" | "approval" | "provider" | "workflow" | "system";
  nextStep?: string;
};

const rawActionPattern = /\b[a-z]+(?:_[a-z0-9]+){1,}\b/g;

function readableActionToken(value: string) {
  return value.replace(rawActionPattern, (match) => friendlyActionName(match));
}

function cleanText(value: string | undefined, fallback: string) {
  const text = (value ?? "").trim() || fallback;
  if (/something went wrong|internal server error|provider_error/i.test(text)) {
    return fallback;
  }
  return readableActionToken(text);
}

function cleanNextStep(value: string | undefined) {
  if (!value) return undefined;
  return cleanText(value, "Try again in a moment.");
}

function actionLabel(result: RuntimeResult) {
  return result.actionName ? friendlyActionName(result.actionName) : "this action";
}

export function buildRuntimeUserChatDisplay(message: string): RuntimeChatDisplay | undefined {
  const match = message.match(/^Continue (?:the )?approved action:\s*(.+)$/i);
  if (!match) return undefined;
  return {
    title: "Continue approved action",
    body: `Continue approved action: ${friendlyActionName(match[1]?.trim() || "this action")}`,
    badge: "Approved",
    tone: "blue",
    category: "approval"
  };
}

export function buildRuntimeChatDisplay(input: {
  agent: RuntimeAgent;
  result: RuntimeResult;
}): RuntimeChatDisplay {
  const { agent, result } = input;
  const safeReply = cleanText(result.reply, "The agent could not finish that request. Please try again in a moment.");
  const nextStep = cleanNextStep(result.nextStep);

  if (result.runtimeState === "needs_permission" || result.reason === "missing_private_info_permission") {
    return {
      title: "Access needed",
      body: `${agent.name} needs access before it can use that private info.`,
      badge: "Needs access",
      tone: "amber",
      category: "permission",
      nextStep: nextStep ?? "Review access and allow only the info you want to share."
    };
  }

  if (result.runtimeState === "needs_approval" || result.status === "awaiting_human_approval") {
    return {
      title: "Waiting for your approval",
      body: result.providerReceipt?.display.summary ?? `${agent.name} paused before ${actionLabel(result)}.`,
      badge: "Waiting for you",
      tone: "amber",
      category: "approval",
      nextStep: nextStep ?? "Choose Allow once or Deny."
    };
  }

  if (result.providerReceipt) {
    const tone = result.providerReceipt.status === "blocked"
      ? "red"
      : result.providerReceipt.status === "waiting_for_approval"
        ? "amber"
        : "green";
    return {
      title: result.providerReceipt.display.title,
      body: result.providerReceipt.display.summary,
      badge: result.providerReceipt.display.badge,
      tone,
      category: "provider",
      nextStep: nextStep ?? result.providerReceipt.display.nextStep ?? undefined
    };
  }

  if (result.workflowResult) {
    return {
      title: result.workflowResult.title || "Workflow result",
      body: result.workflowResult.summary || safeReply,
      badge: result.workflowResult.status === "failed" ? "Needs attention" : "Done",
      tone: result.workflowResult.status === "failed" ? "red" : "green",
      category: "workflow",
      nextStep: nextStep ?? result.workflowResult.nextActions[0]?.label
    };
  }

  if (result.externalRuntime) {
    if (result.externalRuntime.proxyStatus === "blocked") {
      return {
        title: "External agent blocked",
        body: "AI Agent Hub stopped this external action before private info or actions left your account.",
        badge: "Blocked",
        tone: "red",
        category: "provider",
        nextStep: nextStep ?? "Review access and safety settings before trying again."
      };
    }
    if (result.externalRuntime.proxyStatus === "timed_out" || result.externalRuntime.proxyStatus === "failed") {
      return {
        title: "External agent did not finish",
        body: "The external agent could not complete this request right now.",
        badge: "Try again",
        tone: "red",
        category: "provider",
        nextStep: nextStep ?? "Try again in a moment."
      };
    }
    return {
      title: "External agent answered",
      body: safeReply,
      badge: "Done",
      tone: "green",
      category: "provider",
      nextStep
    };
  }

  if (result.status === "blocked") {
    return {
      title: result.runtimeState === "blocked" ? "Nothing continued" : "Request blocked",
      body: safeReply,
      badge: "Blocked",
      tone: "red",
      category: result.intent === "action" ? "approval" : "system",
      nextStep
    };
  }

  if (result.status === "ok" && result.intent === "action") {
    return {
      title: "Action completed",
      body: safeReply,
      badge: "Done",
      tone: "green",
      category: "approval",
      nextStep
    };
  }

  return {
    title: "Agent answered",
    body: safeReply,
    badge: "Done",
    tone: "green",
    category: result.provider === "workflow" ? "workflow" : "answer",
    nextStep
  };
}
