import assert from "node:assert/strict";
import test, { after, afterEach, before } from "node:test";
import { prisma } from "./db/prisma.js";
import { env } from "./config/env.js";
import {
  completeGoogleOAuth,
  completeMicrosoftOAuth,
  disconnectConnectedAccount,
  getConnectorStartState,
  getValidConnectorToken,
  resetConnectorFetchForTest,
  setConnectorFetchForTest
} from "./services/connectorAccountService.js";
import { encryptConnectorToken } from "./services/cryptoService.js";
import { encodeJson } from "./services/jsonService.js";

const userId = `connector-oauth-${Date.now()}`;
const originalGoogle = {
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: env.GOOGLE_REDIRECT_URI
};
const originalMicrosoft = {
  clientId: env.MICROSOFT_CLIENT_ID,
  clientSecret: env.MICROSOFT_CLIENT_SECRET,
  redirectUri: env.MICROSOFT_REDIRECT_URI,
  tenantId: env.MICROSOFT_TENANT_ID
};

before(async () => {
  env.GOOGLE_CLIENT_ID = "google-client-test";
  env.GOOGLE_CLIENT_SECRET = "google-secret-test";
  env.GOOGLE_REDIRECT_URI = "https://api.example.test/api/connectors/google/callback";
  env.MICROSOFT_CLIENT_ID = "microsoft-client-test";
  env.MICROSOFT_CLIENT_SECRET = "microsoft-secret-test";
  env.MICROSOFT_REDIRECT_URI = "https://api.example.test/api/connectors/microsoft/callback";
  env.MICROSOFT_TENANT_ID = "common";
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" } });
});

afterEach(resetConnectorFetchForTest);

after(async () => {
  await prisma.user.delete({ where: { id: userId } });
  env.GOOGLE_CLIENT_ID = originalGoogle.clientId;
  env.GOOGLE_CLIENT_SECRET = originalGoogle.clientSecret;
  env.GOOGLE_REDIRECT_URI = originalGoogle.redirectUri;
  env.MICROSOFT_CLIENT_ID = originalMicrosoft.clientId;
  env.MICROSOFT_CLIENT_SECRET = originalMicrosoft.clientSecret;
  env.MICROSOFT_REDIRECT_URI = originalMicrosoft.redirectUri;
  env.MICROSOFT_TENANT_ID = originalMicrosoft.tenantId;
});

test("Google OAuth uses PKCE, preserves the client return path, and consumes state once", async () => {
  const started = await getConnectorStartState("google", userId, undefined, "/connections/complete");
  assert.equal(started.status, "ready");
  const authorizationUrl = new URL(String(started.authorizationUrl));
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorizationUrl.searchParams.get("code_challenge"));
  const state = String(authorizationUrl.searchParams.get("state"));
  assert.ok(state.length >= 32);

  let tokenBody = "";
  setConnectorFetchForTest(async (url, init) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      tokenBody = String(init?.body);
      return new Response(JSON.stringify({ access_token: "access-token", refresh_token: "refresh-token", expires_in: 3600, scope: started.status === "ready" ? started.scopes?.join(" ") : "" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ email: "oauth-user@example.test", name: "OAuth User" }), { status: 200, headers: { "content-type": "application/json" } });
  });

  const account = await completeGoogleOAuth({ code: "authorization-code", state });
  assert.equal(account.accountLabel, "oauth-user@example.test");
  assert.equal(account.returnPath, "/connections/complete");
  assert.match(tokenBody, /code_verifier=/);
  await assert.rejects(() => completeGoogleOAuth({ code: "second-code", state }), /already used|invalid|expired/i);
});

test("OAuth start supports least-privilege incremental scopes", async () => {
  const started = await getConnectorStartState("google", userId, ["calendar_read"]);
  assert.equal(started.status, "ready");
  if (started.status !== "ready") throw new Error("Expected ready Google OAuth state.");
  assert.ok(started.scopes.includes("openid"));
  assert.ok(started.scopes.includes("https://www.googleapis.com/auth/calendar.readonly"));
  assert.equal(started.scopes.includes("https://www.googleapis.com/auth/gmail.compose"), false);
  assert.equal(new URL(String(started.authorizationUrl)).searchParams.get("include_granted_scopes"), "true");
});

test("Microsoft OAuth uses PKCE and preserves the desktop completion path", async () => {
  const started = await getConnectorStartState("microsoft", userId, ["calendar_read"], "/connections/complete");
  assert.equal(started.status, "ready");
  if (started.status !== "ready") throw new Error("Expected ready Microsoft OAuth state.");
  const authorizationUrl = new URL(String(started.authorizationUrl));
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorizationUrl.searchParams.get("scope")?.includes("Calendars.Read"));
  const state = String(authorizationUrl.searchParams.get("state"));

  setConnectorFetchForTest(async (url, init) => {
    if (String(url).includes("oauth2/v2.0/token")) {
      assert.match(String(init?.body), /code_verifier=/);
      return new Response(JSON.stringify({ access_token: "microsoft-access", refresh_token: "microsoft-refresh", expires_in: 3600, scope: started.scopes.join(" ") }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ displayName: "OAuth User", mail: "microsoft-user@example.test" }), { status: 200, headers: { "content-type": "application/json" } });
  });

  const account = await completeMicrosoftOAuth({ code: "microsoft-code", state });
  assert.equal(account.accountLabel, "microsoft-user@example.test");
  assert.equal(account.returnPath, "/connections/complete");
});

test("disconnect revokes Google at the provider and clears local tokens", async () => {
  const account = await prisma.connectedAccount.findFirstOrThrow({ where: { userId, provider: "google" } });
  let revokeCalls = 0;
  setConnectorFetchForTest(async (url) => {
    assert.match(String(url), /^https:\/\/oauth2\.googleapis\.com\/revoke\?token=/);
    revokeCalls += 1;
    return new Response(null, { status: 200 });
  });

  assert.equal(await disconnectConnectedAccount({ userId, accountId: account.id }), true);
  assert.equal(revokeCalls, 1);
  const revoked = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: account.id } });
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.encryptedAccessToken, null);
  assert.equal(revoked.encryptedRefreshToken, null);
});

test("concurrent refresh callers acquire only one refresh lease", async () => {
  const account = await prisma.connectedAccount.create({
    data: {
      userId,
      provider: "google",
      accountLabel: "refresh-race@example.test",
      status: "active",
      scopes: encodeJson(["https://www.googleapis.com/auth/gmail.readonly"]),
      encryptedAccessToken: encryptConnectorToken("expired-access"),
      encryptedRefreshToken: encryptConnectorToken("refresh-token"),
      expiresAt: new Date(Date.now() - 60_000)
    }
  });
  let refreshCalls = 0;
  setConnectorFetchForTest(async (url) => {
    assert.match(String(url), /oauth2\.googleapis\.com\/token/);
    refreshCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600 }), { status: 200, headers: { "content-type": "application/json" } });
  });

  const results = await Promise.all([
    getValidConnectorToken({ userId, provider: "google", requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"] }),
    getValidConnectorToken({ userId, provider: "google", requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"] })
  ]);
  assert.equal(refreshCalls, 1);
  assert.equal(results.filter((result) => result.status === "ok").length, 1);
  assert.equal(results.filter((result) => result.status === "refreshing").length, 1);
  await prisma.connectedAccount.delete({ where: { id: account.id } });
});
