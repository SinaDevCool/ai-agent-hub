import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test, { after, before } from "node:test";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { createProviderConnection } from "./services/providerConnectionService.js";
import { processDurableJobBatch } from "./services/durableJobService.js";
import { acceptPlaidWebhook, registerPlaidJobHandlers, resetPlaidWebhookFetchForTest, setPlaidWebhookFetchForTest } from "./services/plaidWebhookService.js";

const userId = `plaid-webhook-${Date.now()}`; const original = { live: env.LIVE_FINANCE_ENABLED, jobs: env.DURABLE_JOBS_ENABLED };
const pair = generateKeyPairSync("ec", { namedCurve: "P-256" }); const kid = "plaid-test-key"; const publicJwk = pair.publicKey.export({ format: "jwk" }); let connectionId = "";
before(async () => { env.LIVE_FINANCE_ENABLED = "true"; env.DURABLE_JOBS_ENABLED = "true"; registerPlaidJobHandlers(); await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "salt" } }); const connection = await createProviderConnection({ userId, providerId: "plaid", displayName: "Bank", credentials: { clientId: "client", secret: "secret", accessToken: "access", environment: "sandbox" }, externalAccountId: "item-webhook", metadata: { itemId: "item-webhook" } }); connectionId = connection.id; setPlaidWebhookFetchForTest(async () => Response.json({ key: { ...publicJwk, alg: "ES256", use: "sig", kid, created_at: 1, expired_at: null } })); });
after(async () => { resetPlaidWebhookFetchForTest(); await prisma.durableJob.deleteMany({ where: { userId } }); await prisma.providerWebhookEvent.deleteMany({ where: { providerId: "plaid" } }); await prisma.user.delete({ where: { id: userId } }); env.LIVE_FINANCE_ENABLED = original.live; env.DURABLE_JOBS_ENABLED = original.jobs; await prisma.$disconnect(); });
function jwt(body: Buffer, issuedAt = Math.floor(Date.now() / 1000)) { const header = Buffer.from(JSON.stringify({ alg: "ES256", kid, typ: "JWT" })).toString("base64url"); const claims = Buffer.from(JSON.stringify({ iat: issuedAt, request_body_sha256: createHash("sha256").update(body).digest("hex") })).toString("base64url"); const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key: pair.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url"); return `${header}.${claims}.${signature}`; }

test("Plaid webhooks verify JWT/body integrity, reject replay, deduplicate, and enqueue sync", async () => {
  const body = Buffer.from(JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "item-webhook" }));
  assert.equal((await acceptPlaidWebhook({ rawBody: body, verification: `${jwt(body)}x` })).status, 401);
  assert.equal((await acceptPlaidWebhook({ rawBody: body, verification: jwt(body, Math.floor(Date.now() / 1000) - 600) })).status, 409);
  const verification = jwt(body); const first = await acceptPlaidWebhook({ rawBody: body, verification }); const second = await acceptPlaidWebhook({ rawBody: body, verification }); assert.equal(first.accepted, true); assert.equal(second.deduplicated, true);
  await processDurableJobBatch("plaid-webhook-worker");
  assert.equal(await prisma.durableJob.count({ where: { userId, jobType: "plaid_reconciliation", aggregateId: "item-webhook" } }), 1);
  assert.equal((await prisma.providerConnection.findUniqueOrThrow({ where: { id: connectionId } })).status, "active");
});
