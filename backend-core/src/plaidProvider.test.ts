import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { getConnectorCapability } from "./services/connectorCapabilityService.js";
import { plaidProvider, resetPlaidFetchForTest, setPlaidFetchForTest } from "./services/providers/plaidProvider.js";

afterEach(resetPlaidFetchForTest);
function capability() { const value = getConnectorCapability("finance.transactions.read"); assert.ok(value); return value; }
const providerConnection = { id: "c", status: "active", displayName: "Plaid", credentials: { clientId: "client", secret: "secret", accessToken: "access-sandbox", environment: "sandbox" } };

test("Plaid transaction sync consumes every cursor page without enabling money movement", async () => {
  const requests: string[] = [];
  setPlaidFetchForTest(async (_url, init) => { const body = JSON.parse(String(init?.body)) as { cursor?: string }; requests.push(body.cursor ?? "initial"); const second = body.cursor === "cursor-1"; return new Response(JSON.stringify(second ? { added: [{ transaction_id: "two" }], modified: [], removed: [], next_cursor: "cursor-2", has_more: false } : { added: [{ transaction_id: "one" }], modified: [], removed: [], next_cursor: "cursor-1", has_more: true }), { status: 200, headers: { "Content-Type": "application/json" } }); });
  const result = await plaidProvider.execute({ userId: "u", agentId: "a", capability: capability(), action: "sync_status", input: {}, attempt: 1, providerConnection });
  assert.equal(result.status, "ok"); if (result.status === "ok") { assert.equal((result.result?.added as unknown[]).length, 2); assert.equal(result.result?.nextCursor, "cursor-2"); assert.equal(result.result?.readOnly, true); }
  assert.deepEqual(requests, ["initial", "cursor-1"]);
  assert.equal(plaidProvider.actions.includes("execute_action"), false);
});

test("Plaid refuses synchronization without user-authorized credentials", async () => {
  const result = await plaidProvider.execute({ userId: "u", agentId: "a", capability: capability(), action: "search", input: {}, attempt: 1 });
  assert.equal(result.status, "blocked"); if (result.status === "blocked") assert.equal(result.code, "connector_not_connected");
});
