import { createGoogleEmailDraft, findGoogleCalendarFreeTime, searchGoogleEmail } from "../../googleConnectorService.js";
import type { AdapterExecutionInput, ToolAdapter } from "../toolExecutionTypes.js";

function provider(definitionConfig: Record<string, unknown> | undefined) {
  return typeof definitionConfig?.provider === "string" ? definitionConfig.provider : undefined;
}

export const googleAdapter: ToolAdapter = {
  type: "oauth_api",
  canHandle(definition) {
    return definition.adapterType === "oauth_api" && (provider(definition.adapterConfig) === "google" || definition.requiredConnector === "google");
  },
  async execute(input: AdapterExecutionInput) {
    if (input.toolName === "email.search") {
      const result = await searchGoogleEmail({
        userId: input.userId,
        query: typeof input.arguments.query === "string" ? input.arguments.query : "",
        limit: typeof input.arguments.limit === "number" ? input.arguments.limit : 5
      });
      if (result.status === "blocked") return { status: "blocked", reason: result.reason };
      return { status: "ok", result: { provider: "google", messages: result.messages } };
    }

    if (input.toolName === "email.draft_reply") {
      const to = typeof input.arguments.to === "string" ? input.arguments.to : "";
      const subject = typeof input.arguments.subject === "string" ? input.arguments.subject : "Draft from AI Agent Hub";
      const body = typeof input.arguments.body === "string" ? input.arguments.body : "";
      if (!to || !body) return { status: "blocked", reason: "To create an email draft, provide a recipient and body." };
      const result = await createGoogleEmailDraft({ userId: input.userId, to, subject, body });
      if (result.status === "blocked") return { status: "blocked", reason: result.reason };
      return {
        status: "ok",
        result: { provider: "google", draftId: result.draftId, messageId: result.messageId, threadId: result.threadId }
      };
    }

    if (input.toolName === "calendar.find_free_time") {
      const result = await findGoogleCalendarFreeTime({
        userId: input.userId,
        days: typeof input.arguments.days === "number" ? input.arguments.days : 7
      });
      if (result.status === "blocked") return { status: "blocked", reason: result.reason };
      return { status: "ok", result: { provider: "google", busy: result.busy, suggestion: result.suggestion } };
    }

    if (input.toolName === "email.send" || input.toolName === "calendar.create_event") {
      return { status: "blocked", reason: `${input.toolName} is intentionally disabled until approval and safety controls are expanded.` };
    }

    return { status: "blocked", reason: `${input.toolName} is registered as a Google tool, but execution is not implemented yet.` };
  }
};
