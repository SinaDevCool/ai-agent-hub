import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "./db/prisma.js";
import { createLifeActionPlan, persistLifeActionPlan } from "./services/lifeTransactionService.js";
import {
  beginProviderAttempt,
  claimProviderIdempotency,
  finishProviderAttempt,
  finishProviderWebhook,
  providerRequestHash,
  receiveProviderWebhook
} from "./services/providerDeliveryService.js";

test("provider request hashes are stable across object key ordering", () => {
  assert.equal(providerRequestHash({ b: 2, a: 1 }), providerRequestHash({ a: 1, b: 2 }));
});

test("provider idempotency replays the same request and rejects a changed request", async () => {
  const userId = `delivery-${Date.now()}-idempotency`;
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" } });
  const first = await claimProviderIdempotency({ userId, providerId: "sandbox", idempotencyKey: "book-1", request: { offerId: "A" } });
  const replay = await claimProviderIdempotency({ userId, providerId: "sandbox", idempotencyKey: "book-1", request: { offerId: "A" } });
  assert.equal(first.claimed, true);
  assert.equal(replay.claimed, false);
  await assert.rejects(() => claimProviderIdempotency({ userId, providerId: "sandbox", idempotencyKey: "book-1", request: { offerId: "B" } }), /different request/i);
});

test("provider attempts and webhook events are durably recorded and deduplicated", async () => {
  const userId = `delivery-${Date.now()}-attempt`;
  const eventId = `event-${userId}`;
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" } });
  const plan = createLifeActionPlan({ capabilityKey: "travel.flight.book", executionLevel: "transact", values: { offerId: "A" } });
  const transaction = await persistLifeActionPlan(userId, plan);
  const attempt = await beginProviderAttempt({ lifeTransactionId: transaction.id, providerId: "sandbox", action: "execute_action", attemptNumber: 1 });
  const finished = await finishProviderAttempt({ id: attempt.id, status: "confirmed", externalReference: "order-1" });
  assert.equal(finished.status, "confirmed");

  const first = await receiveProviderWebhook({ providerId: "sandbox", externalEventId: eventId, eventType: "order.confirmed", payload: { orderId: "order-1" } });
  const replay = await receiveProviderWebhook({ providerId: "sandbox", externalEventId: eventId, eventType: "order.confirmed", payload: { orderId: "order-1" } });
  assert.equal(first.duplicate, false);
  assert.equal(replay.duplicate, true);
  const processed = await finishProviderWebhook({ id: first.event.id, succeeded: true });
  assert.equal(processed.status, "processed");

  await prisma.user.delete({ where: { id: userId } });
});
