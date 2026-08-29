import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { getConnectorCapability } from "./services/connectorCapabilityService.js";
import { homeAssistantProvider, resetHomeAssistantFetchForTest, setHomeAssistantFetchForTest } from "./services/providers/homeAssistantProvider.js";

const originals = { read: env.LIVE_SMART_HOME_READ_ENABLED, control: env.LIVE_SMART_HOME_CONTROL_ENABLED, origins: env.HOME_ASSISTANT_ALLOWED_ORIGINS };
afterEach(() => { resetHomeAssistantFetchForTest(); env.LIVE_SMART_HOME_READ_ENABLED = originals.read; env.LIVE_SMART_HOME_CONTROL_ENABLED = originals.control; env.HOME_ASSISTANT_ALLOWED_ORIGINS = originals.origins; });
function capability(key: string) { const value = getConnectorCapability(key); assert.ok(value); return value; }
const connection = { id: "ha-connection", status: "active", displayName: "Home", credentials: { baseUrl: "https://home.example.test", accessToken: "secret-token", entityAllowlist: "light.living_room,switch.desk,climate.hallway" } };
function input(key: "home.device.read" | "home.device.control", action: "status" | "execute_action", values: Record<string, unknown>, extra: Record<string, unknown> = {}) { return { userId: "ha-user", agentId: "ha-agent", capability: capability(key), action, input: values, attempt: 1, providerConnection: connection, ...extra }; }

test("Home Assistant stays disabled and rejects origins outside the operator allowlist", async () => {
  env.LIVE_SMART_HOME_READ_ENABLED = "false";
  assert.equal((await homeAssistantProvider.execute(input("home.device.read", "status", { entityIds: ["light.living_room"] }))).status, "blocked");
  env.LIVE_SMART_HOME_READ_ENABLED = "true"; env.HOME_ASSISTANT_ALLOWED_ORIGINS = "https://different.example.test";
  const result = await homeAssistantProvider.execute(input("home.device.read", "status", { entityIds: ["light.living_room"] }));
  assert.equal(result.status, "blocked"); if (result.status === "blocked") assert.equal(result.code, "connector_not_connected");
});

test("Home Assistant reads only explicitly allowlisted entities and sends no token in results", async () => {
  env.LIVE_SMART_HOME_READ_ENABLED = "true"; env.HOME_ASSISTANT_ALLOWED_ORIGINS = "https://home.example.test";
  let authorization = "";
  setHomeAssistantFetchForTest(async (url, init) => { authorization = String((init?.headers as Record<string, string>).Authorization); return Response.json({ entity_id: decodeURIComponent(String(url).split("/").at(-1) ?? ""), state: "on", attributes: { friendly_name: "Living room" }, last_updated: "2030-01-01T00:00:00Z" }); });
  const result = await homeAssistantProvider.execute(input("home.device.read", "status", { entityIds: ["light.living_room"] }));
  assert.equal(result.status, "ok"); assert.equal(authorization, "Bearer secret-token"); assert.doesNotMatch(JSON.stringify(result), /secret-token/);
  const denied = await homeAssistantProvider.execute(input("home.device.read", "status", { entityIds: ["lock.front_door"] })); assert.equal(denied.status, "blocked");
});

test("Home Assistant requires matching exact approval and bounds commands", async () => {
  env.LIVE_SMART_HOME_CONTROL_ENABLED = "true"; env.HOME_ASSISTANT_ALLOWED_ORIGINS = "https://home.example.test";
  const base = { entityId: "light.living_room", command: "turn_on", approvalRequestId: "approval-1", expectedState: "off" };
  assert.equal((await homeAssistantProvider.execute(input("home.device.control", "execute_action", base, { idempotencyKey: "ha-command-1" }))).status, "blocked");
  assert.equal((await homeAssistantProvider.execute(input("home.device.control", "execute_action", { ...base, entityId: "lock.front_door", command: "unlock" }, { idempotencyKey: "ha-command-2", approvalOverride: { hitlRequestId: "approval-1" } }))).status, "blocked");
  const calls: string[] = [];
  setHomeAssistantFetchForTest(async (url, init) => { calls.push(`${init?.method} ${new URL(String(url)).pathname}`); if (init?.method === "GET") return Response.json({ entity_id: "light.living_room", state: "off", attributes: {}, last_updated: new Date().toISOString() }); return Response.json([{ entity_id: "light.living_room", state: "on", attributes: {}, last_updated: new Date().toISOString() }]); });
  const result = await homeAssistantProvider.execute(input("home.device.control", "execute_action", base, { idempotencyKey: "ha-command-3", approvalOverride: { hitlRequestId: "approval-1" } }));
  assert.equal(result.status, "ok"); assert.deepEqual(calls, ["GET /api/states/light.living_room", "POST /api/services/light/turn_on"]);
  const stale = await homeAssistantProvider.execute(input("home.device.control", "execute_action", { ...base, expectedState: "on" }, { idempotencyKey: "ha-command-4", approvalOverride: { hitlRequestId: "approval-1" } })); assert.equal(stale.status, "blocked");
});

test("Home Assistant write failures are quarantined as uncertain and never retryable", async () => {
  env.LIVE_SMART_HOME_CONTROL_ENABLED = "true"; env.HOME_ASSISTANT_ALLOWED_ORIGINS = "https://home.example.test";
  const userId = `ha-uncertain-${Date.now()}`; await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "salt" } });
  let calls = 0; setHomeAssistantFetchForTest(async (_url, init) => { calls += 1; if (init?.method === "GET") return Response.json({ entity_id: "switch.desk", state: "on", attributes: {} }); throw new Error("timeout after dispatch"); });
  const result = await homeAssistantProvider.execute({ ...input("home.device.control", "execute_action", { entityId: "switch.desk", command: "turn_off", approvalRequestId: "approval-2" }, { idempotencyKey: "ha-uncertain-command", approvalOverride: { hitlRequestId: "approval-2" } }), userId });
  assert.equal(calls, 2); assert.equal(result.status, "blocked"); if (result.status === "blocked") { assert.equal(result.retryable, false); assert.match(result.reason, /uncertain/i); }
  assert.equal((await prisma.lifeTransaction.findUniqueOrThrow({ where: { userId_idempotencyKey: { userId, idempotencyKey: "ha-uncertain-command" } } })).state, "uncertain");
  await prisma.lifeTransaction.deleteMany({ where: { userId } }); await prisma.user.delete({ where: { id: userId } });
});
