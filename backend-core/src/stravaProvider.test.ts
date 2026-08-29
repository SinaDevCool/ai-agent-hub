import assert from "node:assert/strict";
import test, { after, afterEach } from "node:test";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { getConnectorCapability } from "./services/connectorCapabilityService.js";
import { createProviderConnection, deleteProviderConnection, resetProviderConnectionTestFetchForTest, setProviderConnectionTestFetchForTest } from "./services/providerConnectionService.js";
import { completeProviderOAuth, resetProviderOAuthFetchForTest, setProviderOAuthFetchForTest, startProviderOAuth } from "./services/providerOAuthService.js";
import { resetStravaFetchForTest, setStravaFetchForTest, stravaProvider } from "./services/providers/stravaProvider.js";

const original = { enabled: env.LIVE_WELLNESS_ENABLED, clientId: env.STRAVA_CLIENT_ID, clientSecret: env.STRAVA_CLIENT_SECRET };
const users: string[] = [];
afterEach(() => { resetStravaFetchForTest(); resetProviderOAuthFetchForTest(); resetProviderConnectionTestFetchForTest(); env.LIVE_WELLNESS_ENABLED = original.enabled; env.STRAVA_CLIENT_ID = original.clientId; env.STRAVA_CLIENT_SECRET = original.clientSecret; delete process.env.STRAVA_CLIENT_ID; delete process.env.STRAVA_CLIENT_SECRET; });
after(async () => { await prisma.lifeTransaction.deleteMany({ where: { userId: { in: users } } }); await prisma.providerConnection.deleteMany({ where: { userId: { in: users } } }); await prisma.activityLog.deleteMany({ where: { userId: { in: users } } }); await prisma.user.deleteMany({ where: { id: { in: users } } }); });
function capability(key: string) { const value = getConnectorCapability(key); assert.ok(value); return value; }
function dates(days = 7) { const end = new Date(); const start = new Date(end.valueOf() - days * 86_400_000); return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }; }
const connection = { id: "strava-connection", status: "active", displayName: "Strava", credentials: { accessToken: "strava-access", refreshToken: "strava-refresh", grantedScopes: "activity:read" } };
function execution(key: "wellness.activity.read" | "wellness.plan.prepare", action: "search" | "prepare_action", input: Record<string, unknown>, extra: Record<string, unknown> = {}) { return { userId: "strava-user", agentId: "agent", capability: capability(key), action, input, attempt: 1, providerConnection: connection, ...extra }; }
function rawActivity(overrides: Record<string, unknown> = {}) { return { id: 123, name: "Morning Run", sport_type: "Run", start_date: new Date().toISOString(), moving_time: 1800, distance: 5000, total_elevation_gain: 40, map: { summary_polyline: "private-route" }, start_latlng: [1, 2], ...overrides }; }

test("Strava is disabled by default and requests only activity:read OAuth scope", async () => {
  env.LIVE_WELLNESS_ENABLED = "false";
  assert.equal((await stravaProvider.execute(execution("wellness.activity.read", "search", { connectionId: "strava", ...dates() }))).status, "blocked");
  process.env.STRAVA_CLIENT_ID = "client"; process.env.STRAVA_CLIENT_SECRET = "secret";
  const started = startProviderOAuth({ userId: "oauth-user", providerId: "strava" }); const url = new URL(started.authorizationUrl);
  assert.deepEqual(url.searchParams.getAll("scope"), ["activity:read"]); assert.equal(url.searchParams.has("activity:write"), false);
});

test("Strava normalizes read-only activities without route or token leakage and bounds dates", async () => {
  env.LIVE_WELLNESS_ENABLED = "true"; let requested = "";
  const missingScope = await stravaProvider.execute({ ...execution("wellness.activity.read", "search", { connectionId: "strava", ...dates() }), providerConnection: { ...connection, credentials: { accessToken: "strava-access", grantedScopes: "read" } } }); assert.equal(missingScope.status, "blocked");
  setStravaFetchForTest(async (url) => { requested = String(url); return Response.json([rawActivity()]); });
  const result = await stravaProvider.execute(execution("wellness.activity.read", "search", { connectionId: "strava", ...dates() }));
  assert.equal(result.status, "ok"); assert.match(requested, /per_page=200/); assert.doesNotMatch(JSON.stringify(result), /private-route|start_latlng|strava-access/);
  const tooWide = await stravaProvider.execute(execution("wellness.activity.read", "search", { connectionId: "strava", ...dates(40) })); assert.equal(tooWide.status, "blocked");
});

test("Strava prepares conservative plans, blocks medical requests, and replays without another provider call", async () => {
  env.LIVE_WELLNESS_ENABLED = "true"; const userId = `strava-plan-${Date.now()}`; users.push(userId); await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "salt" } });
  let calls = 0; setStravaFetchForTest(async () => { calls += 1; return Response.json([rawActivity({ start_date: new Date(Date.now() - 40 * 86_400_000).toISOString() })]); });
  const medical = await stravaProvider.execute({ ...execution("wellness.plan.prepare", "prepare_action", { goal: "Treat my injury with a medication dosage", startDate: dates().endDate }, { idempotencyKey: "medical" }), userId }); assert.equal(medical.status, "blocked");
  const args = { ...execution("wellness.plan.prepare", "prepare_action", { goal: "Build a consistent walking routine", startDate: dates().endDate }, { idempotencyKey: "plan-1" }), userId };
  const first = await stravaProvider.execute(args); const replay = await stravaProvider.execute(args); assert.equal(first.status, "ok"); assert.equal(replay.status, "ok"); assert.equal(calls, 1); assert.deepEqual(first.status === "ok" ? first.result : {}, replay.status === "ok" ? replay.result : {}); assert.equal((await prisma.lifeTransaction.findMany({ where: { userId } })).length, 1); assert.match(JSON.stringify(first), /No progression is suggested/);
  const conflict = await stravaProvider.execute({ ...args, input: { ...args.input, goal: "A different routine" } }); assert.equal(conflict.status, "blocked");
});

test("Strava marks rejected consent for reconnect and disconnect revokes provider tokens", async () => {
  env.LIVE_WELLNESS_ENABLED = "true"; setStravaFetchForTest(async () => Response.json({ message: "Authorization Error" }, { status: 401 }));
  const rejected = await stravaProvider.execute(execution("wellness.activity.read", "search", { connectionId: "strava", ...dates() })); assert.equal(rejected.status, "blocked"); if (rejected.status === "blocked") assert.equal(rejected.code, "connector_expired");
  const userId = `strava-revoke-${Date.now()}`; users.push(userId); await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "salt" } });
  const saved = await createProviderConnection({ userId, providerId: "strava", credentials: { accessToken: "access", refreshToken: "refresh", grantedScopes: "activity:read" } }); env.STRAVA_CLIENT_ID = "client"; env.STRAVA_CLIENT_SECRET = "secret"; let request: { url: string; init?: RequestInit } | undefined;
  setProviderConnectionTestFetchForTest(async (url, init) => { request = { url: String(url), init }; return new Response(null, { status: 200 }); }); assert.equal(await deleteProviderConnection({ userId, connectionId: saved.id }), true); assert.equal(request?.url, "https://www.strava.com/oauth/revoke"); assert.match(String(request?.init?.body), /token=refresh/); assert.match(String((request?.init?.headers as Record<string, string>).Authorization), /^Basic /);
});

test("Strava OAuth stores athlete identity and exact expiry without exposing tokens", async () => {
  const userId = `strava-oauth-${Date.now()}`; users.push(userId); await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "salt" } }); process.env.STRAVA_CLIENT_ID = "client"; process.env.STRAVA_CLIENT_SECRET = "secret";
  const started = startProviderOAuth({ userId, providerId: "strava" }); const expiresAt = Math.floor(Date.now() / 1000) + 21_600;
  setProviderOAuthFetchForTest(async () => Response.json({ access_token: "oauth-access", refresh_token: "oauth-refresh", expires_at: expiresAt, expires_in: 21_600, scope: "activity:read", athlete: { id: 42, firstname: "Test", lastname: "Athlete" } }));
  const completed = await completeProviderOAuth({ code: "code", state: started.state }); assert.equal(completed.connection.externalAccountId, "42"); assert.equal(completed.connection.externalAccountLabel, "Test Athlete"); assert.deepEqual(completed.connection.scopes, ["activity:read"]); assert.equal(completed.connection.expiresAt, new Date(expiresAt * 1000).toISOString()); assert.doesNotMatch(JSON.stringify(completed), /oauth-access|oauth-refresh/);
});
