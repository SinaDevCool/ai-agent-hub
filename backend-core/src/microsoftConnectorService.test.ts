import assert from "node:assert/strict";
import test, { after, afterEach, before } from "node:test";
import { prisma } from "./db/prisma.js";
import { encryptConnectorToken } from "./services/cryptoService.js";
import { encodeJson } from "./services/jsonService.js";
import { createMicrosoftCalendarEvent, createMicrosoftEmailDraft, findMicrosoftCalendarFreeTime, resetMicrosoftGraphFetchForTest, searchMicrosoftDriveFiles, searchMicrosoftEmail, sendMicrosoftEmailDraft, setMicrosoftGraphFetchForTest } from "./services/microsoftConnectorService.js";

const userId = `microsoft-${Date.now()}`;
before(async () => {
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" } });
  await prisma.connectedAccount.create({ data: { userId, provider: "microsoft", accountLabel: "test@example.com", status: "active", scopes: encodeJson(["Mail.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite", "Files.Read"]), encryptedAccessToken: encryptConnectorToken("graph-token"), expiresAt: new Date(Date.now() + 3_600_000) } });
});
afterEach(resetMicrosoftGraphFetchForTest);
after(async () => { await prisma.user.delete({ where: { id: userId } }); });

test("Microsoft Graph administration functions use the connected token and normalize results", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  setMicrosoftGraphFetchForTest(async (url, init) => {
    requests.push({ url: String(url), init });
    const path = String(url);
    const body = path.includes("/messages?") ? { value: [{ id: "mail-1", subject: "Trip", from: { emailAddress: { address: "sender@example.com" } }, bodyPreview: "Details" }] }
      : path.endsWith("/me/messages") ? { id: "draft-1", webLink: "https://outlook.test/draft-1" }
        : path.includes("calendarView") ? { value: [{ id: "busy-1", subject: "Busy", start: { dateTime: "2030-01-01T09:00:00" }, end: { dateTime: "2030-01-01T10:00:00" } }] }
          : path.endsWith("/me/events") ? { id: "event-1", webLink: "https://outlook.test/event-1" }
            : path.includes("/drive/root/search") ? { value: [{ id: "file-1", name: "Plan.docx", webUrl: "https://onedrive.test/file-1", file: { mimeType: "application/docx" } }] }
              : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  assert.equal((await searchMicrosoftEmail({ userId, query: "Trip" })).status, "ok");
  assert.equal((await createMicrosoftEmailDraft({ userId, to: "to@example.com", subject: "Hello", body: "Body" })).status, "ok");
  assert.equal((await sendMicrosoftEmailDraft({ userId, draftId: "draft-1" })).status, "ok");
  assert.equal((await findMicrosoftCalendarFreeTime({ userId })).status, "ok");
  assert.equal((await createMicrosoftCalendarEvent({ userId, title: "Meeting", start: "2030-01-01T09:00:00", end: "2030-01-01T10:00:00" })).status, "ok");
  assert.equal((await searchMicrosoftDriveFiles({ userId, query: "Plan" })).status, "ok");
  assert.ok(requests.every((request) => (request.init?.headers as Record<string, string>).authorization === "Bearer graph-token"));
});

test("Microsoft Graph blocks cleanly when no Microsoft account is connected", async () => {
  const otherId = `${userId}-missing`;
  await prisma.user.create({ data: { id: otherId, email: `${otherId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" } });
  const result = await searchMicrosoftEmail({ userId: otherId, query: "hello" });
  assert.equal(result.status, "blocked");
  await prisma.user.delete({ where: { id: otherId } });
});
