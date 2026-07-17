import { httpError } from "../errors/httpError.js";
import { getValidConnectorToken } from "./connectorAccountService.js";

const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";
const gmailComposeScope = "https://www.googleapis.com/auth/gmail.compose";
const calendarReadonlyScope = "https://www.googleapis.com/auth/calendar.readonly";

type GoogleMessageList = {
  messages?: Array<{ id: string; threadId?: string }>;
};

type GoogleMessage = {
  id: string;
  threadId?: string;
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
  internalDate?: string;
};

type GoogleDraft = {
  id?: string;
  message?: { id?: string; threadId?: string };
};

type GoogleEvents = {
  items?: Array<{
    id?: string;
    summary?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  }>;
};

function header(message: GoogleMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function googleFetch<T>(input: { userId: string; url: string; scopes: string[]; init?: RequestInit }) {
  const token = await getValidConnectorToken({ userId: input.userId, provider: "google", requiredScopes: input.scopes });
  if (token.status !== "ok") {
    return { status: "blocked" as const, reason: token.message };
  }
  const response = await fetch(input.url, {
    ...input.init,
    headers: {
      ...input.init?.headers,
      authorization: `Bearer ${token.accessToken}`,
      "content-type": "application/json"
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw httpError(response.status >= 500 ? 502 : response.status, body.error?.message ?? "Google request failed.", "google_connector_failed");
  }
  return { status: "ok" as const, body: await response.json().catch(() => ({})) as T };
}

export async function searchGoogleEmail(input: { userId: string; query: string; limit?: number }) {
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", input.query || "newer_than:30d");
  listUrl.searchParams.set("maxResults", String(Math.min(Math.max(input.limit ?? 5, 1), 10)));
  const list = await googleFetch<GoogleMessageList>({ userId: input.userId, url: listUrl.toString(), scopes: [gmailReadonlyScope] });
  if (list.status === "blocked") return list;

  const messages = await Promise.all((list.body.messages ?? []).slice(0, input.limit ?? 5).map(async (message) => {
    const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
    const detail = await googleFetch<GoogleMessage>({ userId: input.userId, url: detailUrl, scopes: [gmailReadonlyScope] });
    if (detail.status === "blocked") return null;
    return {
      id: detail.body.id,
      threadId: detail.body.threadId,
      from: header(detail.body, "From"),
      subject: header(detail.body, "Subject"),
      date: header(detail.body, "Date"),
      snippet: detail.body.snippet ?? ""
    };
  }));

  return { status: "ok" as const, messages: messages.filter(Boolean) };
}

function base64Url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

export async function createGoogleEmailDraft(input: { userId: string; to: string; subject: string; body: string }) {
  const raw = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.body
  ].join("\r\n");
  const response = await googleFetch<GoogleDraft>({
    userId: input.userId,
    url: "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    scopes: [gmailComposeScope],
    init: {
      method: "POST",
      body: JSON.stringify({ message: { raw: base64Url(raw) } })
    }
  });
  if (response.status === "blocked") return response;
  return {
    status: "ok" as const,
    draftId: response.body.id,
    messageId: response.body.message?.id,
    threadId: response.body.message?.threadId
  };
}

export async function findGoogleCalendarFreeTime(input: { userId: string; days?: number }) {
  const now = new Date();
  const end = new Date(now.getTime() + Math.min(Math.max(input.days ?? 7, 1), 14) * 24 * 60 * 60 * 1000);
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", now.toISOString());
  url.searchParams.set("timeMax", end.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  const response = await googleFetch<GoogleEvents>({ userId: input.userId, url: url.toString(), scopes: [calendarReadonlyScope] });
  if (response.status === "blocked") return response;
  const busy = (response.body.items ?? []).map((event) => ({
    id: event.id,
    title: event.summary ?? "Busy",
    start: event.start?.dateTime ?? event.start?.date,
    end: event.end?.dateTime ?? event.end?.date
  }));
  return {
    status: "ok" as const,
    busy,
    suggestion: busy.length
      ? "Review the busy times and choose an open gap."
      : "Your primary calendar has no events in this window."
  };
}
