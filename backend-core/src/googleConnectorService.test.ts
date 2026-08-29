import assert from "node:assert/strict";
import test, { after, afterEach, before } from "node:test";
import { prisma } from "./db/prisma.js";
import { encryptConnectorToken } from "./services/cryptoService.js";
import { encodeJson } from "./services/jsonService.js";
import {
  createGoogleCalendarEvent,
  createGoogleEmailDraft,
  findGoogleCalendarFreeTime,
  resetGoogleApiFetchForTest,
  searchGoogleDriveFiles,
  searchGoogleEmail,
  sendGoogleEmailDraft,
  setGoogleApiFetchForTest
} from "./services/googleConnectorService.js";

const userId = `google-connector-${Date.now()}`;
const scopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.metadata.readonly"
];

before(async () => {
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" } });
  await prisma.connectedAccount.create({ data: { userId, provider: "google", accountLabel: "test@example.test", status: "active", scopes: encodeJson(scopes), encryptedAccessToken: encryptConnectorToken("google-token"), expiresAt: new Date(Date.now() + 3_600_000) } });
});

afterEach(resetGoogleApiFetchForTest);
after(async () => { await prisma.user.delete({ where: { id: userId } }); });

test("Google connector operations use the connected token and normalize results", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  setGoogleApiFetchForTest(async (url, init) => {
    requests.push({ url: String(url), init });
    const target = String(url);
    const body = target.includes("/messages?") ? { messages: [{ id: "message-1", threadId: "thread-1" }] }
      : target.includes("/messages/message-1") ? { id: "message-1", threadId: "thread-1", snippet: "Details", payload: { headers: [{ name: "From", value: "sender@example.test" }, { name: "Subject", value: "Trip" }] } }
        : target.endsWith("/drafts") ? { id: "draft-1", message: { id: "message-draft", threadId: "thread-draft" } }
          : target.endsWith("/drafts/send") ? { id: "message-sent", threadId: "thread-draft" }
            : target.includes("/calendar/v3/calendars/primary/events") && init?.method === "POST" ? { id: "event-1", htmlLink: "https://calendar.example.test/event-1", status: "confirmed" }
              : target.includes("/calendar/v3/calendars/primary/events") ? { items: [{ id: "busy-1", summary: "Busy", start: { dateTime: "2030-01-01T09:00:00Z" }, end: { dateTime: "2030-01-01T10:00:00Z" } }] }
                : target.includes("/drive/v3/files") ? { files: [{ id: "file-1", name: "Plan.docx", mimeType: "application/docx" }] }
                  : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });

  assert.equal((await searchGoogleEmail({ userId, query: "Trip" })).status, "ok");
  assert.equal((await createGoogleEmailDraft({ userId, to: "to@example.test", subject: "Hello", body: "Body" })).status, "ok");
  assert.equal((await sendGoogleEmailDraft({ userId, draftId: "draft-1" })).status, "ok");
  assert.equal((await findGoogleCalendarFreeTime({ userId })).status, "ok");
  assert.equal((await createGoogleCalendarEvent({ userId, title: "Meeting", start: "2030-01-01T09:00:00Z", end: "2030-01-01T10:00:00Z" })).status, "ok");
  assert.equal((await searchGoogleDriveFiles({ userId, query: "Plan" })).status, "ok");
  assert.ok(requests.every((request) => (request.init?.headers as Record<string, string>).authorization === "Bearer google-token"));
});

test("Google connector blocks cleanly without an account", async () => {
  const otherId = `${userId}-missing`;
  await prisma.user.create({ data: { id: otherId, email: `${otherId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" } });
  assert.equal((await searchGoogleEmail({ userId: otherId, query: "hello" })).status, "blocked");
  await prisma.user.delete({ where: { id: otherId } });
});
