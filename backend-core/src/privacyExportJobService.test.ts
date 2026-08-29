import assert from "node:assert/strict";
import test from "node:test";
import { buildPrivacyExport } from "./services/privacyExportJobService.js";

test("privacy export uses a versioned envelope without runtime secrets", () => {
  const value = buildPrivacyExport({ user: { id: "u1", email: "user@example.test", createdAt: new Date("2026-01-01T00:00:00Z") }, requests: [], installs: [], permissions: [], documents: [], activity: [], connections: [{ provider: "google", accountLabel: "user@example.test" }], transactions: [] }, new Date("2026-02-01T00:00:00Z"));
  assert.equal(value.schemaVersion, "privacy-export.v1");
  assert.equal(value.generatedAt, "2026-02-01T00:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(value), /accessToken|refreshToken|encryptedCredentials/i);
});
