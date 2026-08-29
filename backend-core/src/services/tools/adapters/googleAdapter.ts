import { createGoogleCalendarEvent, createGoogleEmailDraft, findGoogleCalendarFreeTime, searchGoogleDriveFiles, searchGoogleEmail, sendGoogleEmailDraft } from "../../googleConnectorService.js";
import { listConnectedAccounts } from "../../connectorAccountService.js";
import { createMicrosoftCalendarEvent, createMicrosoftEmailDraft, findMicrosoftCalendarFreeTime, searchMicrosoftDriveFiles, searchMicrosoftEmail, sendMicrosoftEmailDraft } from "../../microsoftConnectorService.js";
import type { AdapterExecutionInput, ToolAdapter } from "../toolExecutionTypes.js";

function provider(definitionConfig: Record<string, unknown> | undefined) {
  return typeof definitionConfig?.provider === "string" ? definitionConfig.provider : undefined;
}

export const googleAdapter: ToolAdapter = {
  type: "oauth_api",
  canHandle(definition) {
    return definition.adapterType === "oauth_api" && (["google", "office"].includes(provider(definition.adapterConfig) ?? "") || ["google", "office"].includes(definition.requiredConnector ?? ""));
  },
  async execute(input: AdapterExecutionInput) {
    const accounts = await listConnectedAccounts(input.userId);
    const useMicrosoft = !accounts.some((account) => account.provider === "google" && account.status === "active") && accounts.some((account) => account.provider === "microsoft" && account.status === "active");
    const activeProvider = useMicrosoft ? "microsoft" : "google";
    if (input.toolName === "email.search") {
      const result = await (useMicrosoft ? searchMicrosoftEmail : searchGoogleEmail)({
        userId: input.userId,
        query: typeof input.arguments.query === "string" ? input.arguments.query : "",
        limit: typeof input.arguments.limit === "number" ? input.arguments.limit : 5
      });
      if (result.status === "blocked") return { status: "blocked", reason: result.reason };
      return { status: "ok", result: { provider: activeProvider, messages: result.messages } };
    }

    if (input.toolName === "email.draft_reply") {
      const to = typeof input.arguments.to === "string" ? input.arguments.to : "";
      const subject = typeof input.arguments.subject === "string" ? input.arguments.subject : "Draft from AI Agent Hub";
      const body = typeof input.arguments.body === "string" ? input.arguments.body : "";
      if (!to || !body) return { status: "blocked", reason: "To create an email draft, provide a recipient and body." };
      const result = await (useMicrosoft ? createMicrosoftEmailDraft : createGoogleEmailDraft)({ userId: input.userId, to, subject, body });
      if (result.status === "blocked") return { status: "blocked", reason: result.reason };
      return {
        status: "ok",
        result: { provider: activeProvider, ...result }
      };
    }

    if (input.toolName === "calendar.find_free_time") {
      const result = await (useMicrosoft ? findMicrosoftCalendarFreeTime : findGoogleCalendarFreeTime)({
        userId: input.userId,
        days: typeof input.arguments.days === "number" ? input.arguments.days : 7
      });
      if (result.status === "blocked") return { status: "blocked", reason: result.reason };
      return { status: "ok", result: { provider: activeProvider, busy: result.busy, suggestion: result.suggestion } };
    }

    if (input.toolName === "email.send") {
      const draftId = typeof input.arguments.draftId === "string" ? input.arguments.draftId : "";
      if (!draftId) return { status: "blocked", reason: "Select a saved Gmail draft before sending." };
      const result = await (useMicrosoft ? sendMicrosoftEmailDraft : sendGoogleEmailDraft)({ userId: input.userId, draftId });
      if (result.status === "blocked") return { status: "blocked", reason: result.reason };
      return { status: "ok", result: { provider: activeProvider, ...result } };
    }
    if (input.toolName === "calendar.create_event") {
      const title = typeof input.arguments.title === "string" ? input.arguments.title : "";
      const start = typeof input.arguments.start === "string" ? input.arguments.start : "";
      const end = typeof input.arguments.end === "string" ? input.arguments.end : "";
      if (!title || !start || !end) return { status: "blocked", reason: "Calendar events require a title, start, and end." };
      const result = await (useMicrosoft ? createMicrosoftCalendarEvent : createGoogleCalendarEvent)({ userId: input.userId, title, start, end, timeZone: typeof input.arguments.timeZone === "string" ? input.arguments.timeZone : undefined, description: typeof input.arguments.description === "string" ? input.arguments.description : undefined, location: typeof input.arguments.location === "string" ? input.arguments.location : undefined });
      if (result.status === "blocked") return { status: "blocked", reason: result.reason };
      return { status: "ok", result: { provider: activeProvider, ...result } };
    }
    if (input.toolName === "drive.search") {
      const query = typeof input.arguments.query === "string" ? input.arguments.query : "";
      if (!query) return { status: "blocked", reason: "Describe the Google Drive file to find." };
      const result = await (useMicrosoft ? searchMicrosoftDriveFiles : searchGoogleDriveFiles)({ userId: input.userId, query, limit: typeof input.arguments.limit === "number" ? input.arguments.limit : 10 });
      if (result.status === "blocked") return { status: "blocked", reason: result.reason };
      return { status: "ok", result: { provider: activeProvider, files: result.files } };
    }

    return { status: "blocked", reason: `${input.toolName} is registered as an office tool, but execution is not implemented yet.` };
  }
};
