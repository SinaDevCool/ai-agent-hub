import assert from "node:assert/strict";
import test, { after, afterEach, before } from "node:test";
import { prisma } from "./db/prisma.js";
import { env } from "./config/env.js";
import {
  completeGoogleOAuth,
  disconnectConnectedAccount,
  getConnectorStartState,
  resetConnectorFetchForTest,
  setConnectorFetchForTest
} from "./services/connectorAccountService.js";

const userId = `connector-oauth-${Date.now()}`;
const originalGoogle = {
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: env.GOOGLE_REDIRECT_URI
};

before(async () => {
  env.GOOGLE_CLIENT_ID = "google-client-test";
  env.GOOGLE_CLIENT_SECRET = "google-secret-test";
  env.GOOGLE_REDIRECT_URI = "https://api.example.test/api/connectors/google/callback";
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" } });
});

afterEach(resetConnectorFetchForTest);

after(async () => {
  await prisma.user.delete({ where: { id: userId } });
  env.GOOGLE_CLIENT_ID = originalGoogle.clientId;
  env.GOOGLE_CLIENT_SECRET = originalGoogle.clientSecret;
  env.GOOGLE_REDIRECT_URI = originalGoogle.redirectUri;
});

test("Google OAuth uses PKCE and a one-time persisted state", async () => {
  const started = await getConnectorStartState("google", userId);
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
  assert.match(tokenBody, /code_verifier=/);
  await assert.rejects(() => completeGoogleOAuth({ code: "second-code", state }), /already used|invalid|expired/i);
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
