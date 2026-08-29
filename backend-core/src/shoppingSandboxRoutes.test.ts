import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "./app.js";
import { prisma } from "./db/prisma.js";

const runId = `shopping-routes-${Date.now()}`;
const owner = `${runId}-owner`; const outsider = `${runId}-outsider`;
let server: Server; let baseUrl = "";
async function post(path: string, userId: string, body?: unknown) { return fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-user-id": userId }, body: JSON.stringify(body ?? {}) }); }
before(async () => { await prisma.user.createMany({ data: [owner, outsider].map((id) => ({ id, email: `${id}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" })) }); server = createApp().listen(0); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); await prisma.user.deleteMany({ where: { id: { in: [owner, outsider] } } }); });

test("shopping sandbox searches, prepares checkout, orders idempotently, and cancels with ownership", async () => {
  const search = await post("/api/life-platform/shopping/sandbox/search", owner, { query: "noise cancelling headphones" });
  assert.equal(search.status, 200); const offer = ((await search.json()) as { offers: unknown[] }).offers[0];
  const checkout = await post("/api/life-platform/shopping/sandbox/checkout", owner, { offer, quantity: 2 });
  assert.equal(checkout.status, 200); assert.equal(((await checkout.json()) as { checkout: { approvalRequired: boolean; total: string } }).checkout.total, "79.80");
  const body = { offer, quantity: 2, confirmed: true, idempotencyKey: `${runId}-order` };
  const ordered = await post("/api/life-platform/shopping/sandbox/order", owner, body); assert.equal(ordered.status, 201);
  const transaction = ((await ordered.json()) as { transaction: { id: string; state: string } }).transaction; assert.equal(transaction.state, "confirmed");
  const replay = await post("/api/life-platform/shopping/sandbox/order", owner, body); assert.equal(((await replay.json()) as { transaction: { id: string } }).transaction.id, transaction.id);
  assert.equal((await post(`/api/life-platform/shopping/sandbox/${transaction.id}/cancel`, outsider, { confirmed: true })).status, 400);
  const cancelled = await post(`/api/life-platform/shopping/sandbox/${transaction.id}/cancel`, owner, { confirmed: true }); assert.equal(((await cancelled.json()) as { transaction: { state: string } }).transaction.state, "cancelled");
});

test("shopping sandbox requires approval and rejects forged offers", async () => {
  const forged = { id: "external-item", checkoutMode: "live" };
  assert.equal((await post("/api/life-platform/shopping/sandbox/order", owner, { offer: forged, quantity: 1, confirmed: true, idempotencyKey: "forged" })).status, 400);
  const offer = ((await (await post("/api/life-platform/shopping/sandbox/search", owner, { query: "lamp" })).json()) as { offers: unknown[] }).offers[0];
  assert.equal((await post("/api/life-platform/shopping/sandbox/order", owner, { offer, quantity: 1, idempotencyKey: "unconfirmed" })).status, 400);
});

test("shopping lists persist, update by name, isolate users, and delete by owner", async () => {
  const put = (userId: string, body: unknown) => fetch(`${baseUrl}/api/life-platform/shopping/lists`, { method: "PUT", headers: { "content-type": "application/json", "x-user-id": userId }, body: JSON.stringify(body) });
  const first = await put(owner, { name: "Weekly groceries", items: [{ name: "Oats", quantity: 2 }, { name: "Apples", quantity: 6, checked: true }] }); assert.equal(first.status, 200); const list = ((await first.json()) as { list: { id: string; items: unknown[] } }).list; assert.equal(list.items.length, 2);
  const updated = await put(owner, { name: "Weekly groceries", items: [{ id: "oats", name: "Oats", quantity: 3 }] }); assert.equal(((await updated.json()) as { list: { id: string } }).list.id, list.id);
  const ownerLists = await fetch(`${baseUrl}/api/life-platform/shopping/lists`, { headers: { "x-user-id": owner } }); assert.equal(((await ownerLists.json()) as { lists: unknown[] }).lists.length, 1);
  const outsiderLists = await fetch(`${baseUrl}/api/life-platform/shopping/lists`, { headers: { "x-user-id": outsider } }); assert.equal(((await outsiderLists.json()) as { lists: unknown[] }).lists.length, 0);
  assert.equal((await fetch(`${baseUrl}/api/life-platform/shopping/lists/${list.id}`, { method: "DELETE", headers: { "x-user-id": outsider } })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/life-platform/shopping/lists/${list.id}`, { method: "DELETE", headers: { "x-user-id": owner } })).status, 200);
});

test("live hosted shopping fails closed while its feature flags are disabled", async () => {
  const response = await post("/api/shopping/hosted-checkout/prepare", owner, {
    agentId: "agent-not-contacted",
    title: "Weekly groceries",
    items: [{ name: "Oats", quantity: 2 }],
    idempotencyKey: `${runId}-hosted-disabled`
  });
  assert.equal(response.status, 503);
  assert.equal(((await response.json()) as { error: { code: string } }).error.code, "hosted_shopping_disabled");
  assert.equal(await prisma.lifeTransaction.count({ where: { userId: owner, providerId: "instacart" } }), 0);
});
