import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "./db/prisma.js";
import { cancelSandboxPayment, getFinanceSummary, simulateSandboxPayment, syncFinanceSandbox } from "./services/financeSandboxService.js";

test("finance sandbox sync is read-only, idempotent, summarized, and user scoped", async () => {
  const userId = `finance-sandbox-${Date.now()}`; const outsiderId = `${userId}-outside`;
  await prisma.user.createMany({ data: [userId, outsiderId].map((id) => ({ id, email: `${id}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" })) });
  const first = await syncFinanceSandbox(userId); const replay = await syncFinanceSandbox(userId);
  assert.equal(first.readOnly, true); assert.equal(first.sandbox, true); assert.equal(first.accounts.length, 1); assert.equal(first.transactions.length, 6); assert.equal(replay.transactions.length, 6); assert.ok(first.totals.income > first.totals.spending); assert.ok(first.categories.length > 1); assert.equal(first.recurring.length, 1);
  const outsider = await getFinanceSummary(outsiderId); assert.equal(outsider.accounts.length, 0); assert.equal(outsider.transactions.length, 0);
  await prisma.user.deleteMany({ where: { id: { in: [userId, outsiderId] } } });
});

test("finance payment simulation is confirmed, idempotent, cancellable, and never moves money", async () => {
  const userId = `finance-payment-${Date.now()}`;
  const outsiderId = `${userId}-outside`;
  await prisma.user.createMany({ data: [userId, outsiderId].map((id) => ({ id, email: `${id}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" })) });

  await assert.rejects(
    () => simulateSandboxPayment({ userId, payee: "Example Utility", amount: 42.5, currency: "EUR", confirmed: false, idempotencyKey: "payment-one" }),
    /confirmation is required/i
  );

  const first = await simulateSandboxPayment({ userId, payee: "Example Utility", amount: 42.5, currency: "eur", confirmed: true, idempotencyKey: "payment-one" });
  const replay = await simulateSandboxPayment({ userId, payee: "Example Utility", amount: 42.5, currency: "EUR", confirmed: true, idempotencyKey: "payment-one" });
  assert.equal(first.id, replay.id);
  assert.equal(first.state, "confirmed");
  assert.equal(first.providerId, "finance-sandbox");
  assert.equal(first.result.sandbox, true);
  assert.equal(first.result.simulated, true);
  assert.equal(first.result.moneyMoved, false);
  assert.match(String(first.externalReference), /^PAY-SIM-/);

  await assert.rejects(
    () => cancelSandboxPayment({ userId: outsiderId, id: first.id, confirmed: true }),
    /not found/i
  );
  const cancelled = await cancelSandboxPayment({ userId, id: first.id, confirmed: true });
  assert.equal(cancelled.state, "cancelled");
  assert.equal(cancelled.result.moneyMoved, false);

  await prisma.user.deleteMany({ where: { id: { in: [userId, outsiderId] } } });
});
