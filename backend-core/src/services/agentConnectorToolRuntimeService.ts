import type { RuntimeAgent, RuntimeBranchResult, RuntimeIntent, RuntimeResult } from "./agentRuntimeTypes.js";
import { getCalendarLookupDays, getEmailDraftInput, getEmailSearchQuery } from "./runtimeIntentService.js";
import { executeTool } from "./toolExecutionService.js";

export function isConnectorToolIntent(intent: RuntimeIntent) {
  return intent === "email_search" || intent === "email_draft" || intent === "calendar_free_time";
}

function hasRuntimeTool(tools: Set<string>, toolName: string) {
  if (tools.has(toolName)) return true;
  return toolName === "email.draft_reply" && tools.has("email.draft");
}

function friendlyToolRequirement(toolName: string) {
  if (toolName === "email.search") return "read email";
  if (toolName === "email.draft_reply") return "create email drafts";
  if (toolName === "calendar.find_free_time") return "check calendar availability";
  return toolName;
}

function buildConnectorBlockedReply(agent: RuntimeAgent, toolName: string, reason?: string) {
  const needsGoogle = /google|connect/i.test(reason ?? "");
  if (needsGoogle) {
    return `${agent.name} needs Google connected before it can ${friendlyToolRequirement(toolName)}.`;
  }
  return `${agent.name} cannot ${friendlyToolRequirement(toolName)} right now.`;
}

function formatEmailSearchReply(agent: RuntimeAgent, result: Record<string, unknown> | undefined) {
  const messages = Array.isArray(result?.messages) ? result.messages : [];
  if (!messages.length) {
    return `${agent.name} checked Gmail and did not find matching messages.`;
  }
  const lines = messages.slice(0, 3).map((message, index) => {
    const item = message as { from?: string; subject?: string; snippet?: string };
    const subject = item.subject?.trim() || "No subject";
    const from = item.from?.trim() ? ` from ${item.from.trim()}` : "";
    const snippet = item.snippet?.trim() ? `: ${item.snippet.trim()}` : "";
    return `${index + 1}. ${subject}${from}${snippet}`;
  });
  return `${agent.name} found ${messages.length} matching email${messages.length === 1 ? "" : "s"}:\n${lines.join("\n")}`;
}

function formatCalendarReply(agent: RuntimeAgent, result: Record<string, unknown> | undefined) {
  const suggestion = typeof result?.suggestion === "string" ? result.suggestion : "";
  const busy = Array.isArray(result?.busy) ? result.busy : [];
  if (suggestion) return `${agent.name} checked your calendar. ${suggestion}`;
  return `${agent.name} checked your calendar and found ${busy.length} busy block${busy.length === 1 ? "" : "s"}.`;
}

function formatEmailDraftReply(agent: RuntimeAgent) {
  return `${agent.name} created a Gmail draft. It has not been sent, so you can review it first.`;
}

export async function runConnectorToolIntent(input: {
  userId: string;
  agent: RuntimeAgent;
  agentRunId: string;
  intent: RuntimeIntent;
  message: string;
  tools: Set<string>;
}): Promise<RuntimeBranchResult | null> {
  if (!isConnectorToolIntent(input.intent)) return null;
  const toolName = input.intent === "email_search"
    ? "email.search"
    : input.intent === "email_draft"
      ? "email.draft_reply"
      : "calendar.find_free_time";

  if (!hasRuntimeTool(input.tools, toolName)) {
    const result: RuntimeResult = {
      status: "blocked",
      intent: input.intent,
      reply: `${input.agent.name} is not set up to ${friendlyToolRequirement(toolName)}.`,
      reason: `${toolName} is not enabled for this agent.`,
      runtimeState: "blocked",
      nextStep: "Choose an agent with this connector tool, or add the tool to this agent."
    };
    return {
      result,
      step: {
        title: "Check connector capability",
        input: { toolName },
        error: `${toolName} is not enabled for this agent.`
      }
    };
  }

  const toolArguments = input.intent === "email_search"
    ? { query: getEmailSearchQuery(input.message), limit: 5 }
    : input.intent === "email_draft"
      ? getEmailDraftInput(input.message)
      : { days: getCalendarLookupDays(input.message) };

  if (input.intent === "email_draft" && (!("to" in toolArguments) || !toolArguments.to || !toolArguments.body)) {
    const result: RuntimeResult = {
      status: "blocked",
      intent: input.intent,
      reply: `${input.agent.name} can draft an email, but needs a recipient and what the draft should say.`,
      reason: "Email draft requests need a recipient and body.",
      runtimeState: "blocked",
      nextStep: "Try: Draft an email to name@example.com saying I will follow up tomorrow."
    };
    return {
      result,
      step: {
        title: "Prepare email draft",
        input: { message: input.message },
        error: "Email draft requests need a recipient and body."
      }
    };
  }

  const toolResult = await executeTool({
    userId: input.userId,
    agentId: input.agent.id,
    agentRunId: input.agentRunId,
    toolName,
    arguments: toolArguments
  });

  if (toolResult.status === "awaiting_human_approval") {
    const result: RuntimeResult = {
      status: "awaiting_human_approval",
      intent: input.intent,
      reply: `${input.agent.name} paused this request and sent it to you for approval.`,
      runtimeState: "needs_approval",
      nextStep: "Approve or deny this request before the agent continues.",
      requestId: toolResult.requestId
    };
    return {
      result,
      step: {
        title: "Use connector tool",
        toolRunId: toolResult.toolRunId,
        input: toolArguments,
        output: { requestId: toolResult.requestId }
      }
    };
  }

  if (toolResult.status === "blocked") {
    const needsGoogle = /connect|google/i.test(toolResult.reason);
    const result: RuntimeResult = {
      status: "blocked",
      intent: input.intent,
      reply: buildConnectorBlockedReply(input.agent, toolName, toolResult.reason),
      reason: toolResult.reason,
      runtimeState: "blocked",
      nextStep: needsGoogle ? "Connect Google in Settings, then try again." : "Try again or choose a different agent."
    };
    return {
      result,
      step: {
        title: "Use connector tool",
        toolRunId: toolResult.toolRunId,
        input: toolArguments,
        error: toolResult.reason
      }
    };
  }

  const reply = input.intent === "email_search"
    ? formatEmailSearchReply(input.agent, toolResult.result)
    : input.intent === "email_draft"
      ? formatEmailDraftReply(input.agent)
      : formatCalendarReply(input.agent, toolResult.result);
  const result: RuntimeResult = {
    status: "ok",
    intent: input.intent,
    reply,
    runtimeState: "ready",
    nextStep: input.intent === "email_draft" ? "Open Gmail to review and send the draft yourself." : "Ask a follow-up if you want a narrower result."
  };
  return {
    result,
    step: {
      title: "Use connector tool",
      toolRunId: toolResult.toolRunId,
      input: toolArguments,
      output: toolResult.result
    }
  };
}
