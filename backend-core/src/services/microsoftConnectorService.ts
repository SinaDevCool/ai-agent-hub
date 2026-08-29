import { httpError } from "../errors/httpError.js";
import { getValidMicrosoftConnectorToken } from "./connectorAccountService.js";

type FetchLike = typeof fetch;
let graphFetch: FetchLike = fetch;
export function setMicrosoftGraphFetchForTest(value: FetchLike) { graphFetch = value; }
export function resetMicrosoftGraphFetchForTest() { graphFetch = fetch; }

async function microsoftFetch<T>(input: { userId: string; path: string; scopes: string[]; init?: RequestInit }) {
  const token = await getValidMicrosoftConnectorToken({ userId: input.userId, requiredScopes: input.scopes });
  if (token.status !== "ok") return { status: "blocked" as const, reason: token.message };
  const response = await graphFetch(`https://graph.microsoft.com/v1.0${input.path}`, { ...input.init, headers: { ...input.init?.headers, authorization: `Bearer ${token.accessToken}`, "content-type": "application/json" } });
  if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: { message?: string } }; throw httpError(response.status >= 500 ? 502 : response.status, body.error?.message ?? "Microsoft Graph request failed.", "microsoft_connector_failed"); }
  return { status: "ok" as const, body: await response.json().catch(() => ({})) as T };
}

export async function searchMicrosoftEmail(input: { userId: string; query: string; limit?: number }) {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10);
  const path = `/me/messages?$search=${encodeURIComponent(`"${input.query || "received:last month"}"`)}&$top=${limit}&$select=id,subject,from,receivedDateTime,bodyPreview`;
  const response = await microsoftFetch<{ value?: Array<{ id: string; subject?: string; from?: { emailAddress?: { name?: string; address?: string } }; receivedDateTime?: string; bodyPreview?: string }> }>({ userId: input.userId, path, scopes: ["Mail.Read"], init: { headers: { ConsistencyLevel: "eventual" } } });
  if (response.status === "blocked") return response;
  return { status: "ok" as const, messages: (response.body.value ?? []).map((item) => ({ id: item.id, subject: item.subject ?? "", from: item.from?.emailAddress?.name ?? item.from?.emailAddress?.address ?? "", date: item.receivedDateTime ?? "", snippet: item.bodyPreview ?? "" })) };
}

export async function createMicrosoftEmailDraft(input: { userId: string; to: string; subject: string; body: string }) {
  const response = await microsoftFetch<{ id?: string; webLink?: string }>({ userId: input.userId, path: "/me/messages", scopes: ["Mail.ReadWrite"], init: { method: "POST", body: JSON.stringify({ subject: input.subject, body: { contentType: "Text", content: input.body }, toRecipients: [{ emailAddress: { address: input.to } }] }) } });
  if (response.status === "blocked") return response; return { status: "ok" as const, draftId: response.body.id, draftUrl: response.body.webLink };
}
export async function sendMicrosoftEmailDraft(input: { userId: string; draftId: string }) {
  const response = await microsoftFetch<Record<string, never>>({ userId: input.userId, path: `/me/messages/${encodeURIComponent(input.draftId)}/send`, scopes: ["Mail.Send"], init: { method: "POST" } });
  if (response.status === "blocked") return response; return { status: "ok" as const, messageId: input.draftId };
}
export async function createMicrosoftCalendarEvent(input: { userId: string; title: string; start: string; end: string; timeZone?: string; description?: string; location?: string }) {
  const timeZone = input.timeZone ?? "UTC";
  const response = await microsoftFetch<{ id?: string; webLink?: string; isCancelled?: boolean }>({ userId: input.userId, path: "/me/events", scopes: ["Calendars.ReadWrite"], init: { method: "POST", body: JSON.stringify({ subject: input.title, body: { contentType: "Text", content: input.description ?? "" }, start: { dateTime: input.start, timeZone }, end: { dateTime: input.end, timeZone }, location: { displayName: input.location ?? "" } }) } });
  if (response.status === "blocked") return response; return { status: "ok" as const, eventId: response.body.id, eventUrl: response.body.webLink, eventStatus: response.body.isCancelled ? "cancelled" : "confirmed" };
}
export async function findMicrosoftCalendarFreeTime(input: { userId: string; days?: number }) {
  const start = new Date(); const end = new Date(start.getTime() + Math.min(Math.max(input.days ?? 7, 1), 14) * 86_400_000);
  const path = `/me/calendarView?startDateTime=${encodeURIComponent(start.toISOString())}&endDateTime=${encodeURIComponent(end.toISOString())}&$select=id,subject,start,end`;
  const response = await microsoftFetch<{ value?: Array<{ id?: string; subject?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }> }>({ userId: input.userId, path, scopes: ["Calendars.ReadWrite"] });
  if (response.status === "blocked") return response; const busy = (response.body.value ?? []).map((event) => ({ id: event.id, title: event.subject ?? "Busy", start: event.start?.dateTime, end: event.end?.dateTime })); return { status: "ok" as const, busy, suggestion: busy.length ? "Review the busy times and choose an open gap." : "Your Microsoft calendar has no events in this window." };
}
export async function searchMicrosoftDriveFiles(input: { userId: string; query: string; limit?: number }) {
  const response = await microsoftFetch<{ value?: Array<{ id: string; name: string; webUrl?: string; lastModifiedDateTime?: string; file?: { mimeType?: string } }> }>({ userId: input.userId, path: `/me/drive/root/search(q='${encodeURIComponent(input.query.replace(/'/g, "''"))}')?$top=${Math.min(Math.max(input.limit ?? 10, 1), 25)}`, scopes: ["Files.Read.All"] });
  if (response.status === "blocked") return response; return { status: "ok" as const, files: (response.body.value ?? []).map((file) => ({ id: file.id, name: file.name, mimeType: file.file?.mimeType, modifiedTime: file.lastModifiedDateTime, webViewLink: file.webUrl })) };
}
