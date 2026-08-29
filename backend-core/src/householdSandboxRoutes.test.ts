import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "./app.js";
import { prisma } from "./db/prisma.js";

const runId = `household-routes-${Date.now()}`; const owner = `${runId}-owner`; const outsider = `${runId}-outsider`; let server: Server; let baseUrl = "";
async function post(path: string, userId: string, body?: unknown) { return fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-user-id": userId }, body: JSON.stringify(body ?? {}) }); }
before(async () => { await prisma.user.createMany({ data: [owner, outsider].map((id) => ({ id, email: `${id}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" })) }); server = createApp().listen(0); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); await prisma.user.deleteMany({ where: { id: { in: [owner, outsider] } } }); });

test("household sandbox discovers providers, quotes, books idempotently, cancels, and isolates ownership", async () => {
  const description = "Repair a leaking kitchen tap"; const search = await post("/api/life-platform/household/sandbox/search", owner, { serviceType: "Plumber", location: "Berlin", description }); assert.equal(search.status, 200);
  const provider = ((await search.json()) as { providers: unknown[] }).providers[0]; const quoted = await post("/api/life-platform/household/sandbox/quote", owner, { provider, description }); assert.equal(quoted.status, 200); const quote = ((await quoted.json()) as { quote: unknown }).quote;
  const body = { quote, confirmed: true, idempotencyKey: `${runId}-booking` }; const booked = await post("/api/life-platform/household/sandbox/book", owner, body); assert.equal(booked.status, 201); const transaction = ((await booked.json()) as { transaction: { id: string; state: string } }).transaction; assert.equal(transaction.state, "confirmed");
  const replay = await post("/api/life-platform/household/sandbox/book", owner, body); assert.equal(((await replay.json()) as { transaction: { id: string } }).transaction.id, transaction.id);
  assert.equal((await post(`/api/life-platform/household/sandbox/${transaction.id}/cancel`, outsider, { confirmed: true })).status, 400);
  const cancelled = await post(`/api/life-platform/household/sandbox/${transaction.id}/cancel`, owner, { confirmed: true }); assert.equal(((await cancelled.json()) as { transaction: { state: string } }).transaction.state, "cancelled");
});

test("household sandbox refuses unconfirmed and forged bookings", async () => {
  assert.equal((await post("/api/life-platform/household/sandbox/book", owner, { quote: { id: "live", mode: "live" }, confirmed: true, idempotencyKey: "forged" })).status, 400);
  const description = "Assemble a desk"; const provider = ((await (await post("/api/life-platform/household/sandbox/search", owner, { serviceType: "Handyperson", location: "Berlin", description })).json()) as { providers: unknown[] }).providers[0]; const quote = ((await (await post("/api/life-platform/household/sandbox/quote", owner, { provider, description })).json()) as { quote: unknown }).quote;
  assert.equal((await post("/api/life-platform/household/sandbox/book", owner, { quote, idempotencyKey: "unconfirmed" })).status, 400);
});
