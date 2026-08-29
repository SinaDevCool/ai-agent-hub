import { prisma } from "../db/prisma.js";
import { createHash } from "node:crypto";
import { badRequest } from "../errors/httpError.js";
import { createLifeActionPlan, nextLifeActionState, persistLifeActionPlan, serializeLifeTransaction, transitionPersistedLifeTransaction, validateLifeActionPlan } from "./lifeTransactionService.js";

const sandboxRows = [
  { id: "salary", name: "Salary", merchant: "Employer", amount: -3200, category: "INCOME", detailed: "INCOME_WAGES", day: 1 },
  { id: "rent", name: "Monthly rent", merchant: "Landlord", amount: 1250, category: "RENT_AND_UTILITIES", detailed: "RENT", day: 2 },
  { id: "grocery-1", name: "Groceries", merchant: "Local Market", amount: 82.45, category: "FOOD_AND_DRINK", detailed: "GROCERIES", day: 5 },
  { id: "transit", name: "Transit pass", merchant: "City Transit", amount: 49, category: "TRANSPORTATION", detailed: "PUBLIC_TRANSIT", day: 7 },
  { id: "streaming", name: "Streaming subscription", merchant: "Example Stream", amount: 12.99, category: "ENTERTAINMENT", detailed: "SUBSCRIPTION", day: 9 },
  { id: "grocery-2", name: "Groceries", merchant: "Local Market", amount: 64.2, category: "FOOD_AND_DRINK", detailed: "GROCERIES", day: 14 }
];

export async function syncFinanceSandbox(userId: string) {
  const now = new Date();
  const account = await prisma.financialAccount.upsert({ where: { userId_providerId_externalAccountId: { userId, providerId: "finance-sandbox", externalAccountId: "sandbox-checking" } }, update: { currentBalance: 2841.36, availableBalance: 2791.36, dataFreshAt: now, syncCursor: `sandbox-${now.getUTCFullYear()}-${now.getUTCMonth() + 1}` }, create: { userId, providerId: "finance-sandbox", externalAccountId: "sandbox-checking", name: "Sandbox Current Account", type: "depository", subtype: "checking", mask: "4242", currency: "EUR", currentBalance: 2841.36, availableBalance: 2791.36, dataFreshAt: now, syncCursor: `sandbox-${now.getUTCFullYear()}-${now.getUTCMonth() + 1}` } });
  for (const row of sandboxRows) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(row.day, 28)));
    const providerTransactionId = `sandbox-${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${row.id}`;
    await prisma.financialTransaction.upsert({ where: { userId_providerTransactionId: { userId, providerTransactionId } }, update: { amount: row.amount, date, removedAt: null }, create: { userId, financialAccountId: account.id, providerTransactionId, name: row.name, merchantName: row.merchant, amount: row.amount, currency: "EUR", date, categoryPrimary: row.category, categoryDetailed: row.detailed } });
  }
  return getFinanceSummary(userId);
}

export async function getFinanceSummary(userId: string) {
  const accounts = await prisma.financialAccount.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  const transactions = await prisma.financialTransaction.findMany({ where: { userId, removedAt: null }, orderBy: { date: "desc" }, take: 500 });
  const spending = transactions.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const income = Math.abs(transactions.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0));
  const categories = Object.entries(transactions.filter((item) => item.amount > 0).reduce<Record<string, number>>((result, item) => { const key = item.categoryPrimary ?? "OTHER"; result[key] = (result[key] ?? 0) + item.amount; return result; }, {})).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  const subscriptions = transactions.filter((item) => /subscription/i.test(item.categoryDetailed ?? "") || /subscription|stream/i.test(item.name));
  return { sandbox: accounts.some((item) => item.providerId === "finance-sandbox"), readOnly: true, accounts, transactions, totals: { spending, income, netCashFlow: income - spending, currency: accounts[0]?.currency ?? "EUR" }, categories, recurring: subscriptions, dataFreshAt: accounts.map((item) => item.dataFreshAt).filter(Boolean).sort().at(-1) ?? null };
}

export async function simulateSandboxPayment(input: { userId: string; payee: unknown; amount: unknown; currency: unknown; confirmed: unknown; idempotencyKey: unknown }) { if (input.confirmed !== true) throw badRequest("Explicit payment simulation confirmation is required."); const payee = String(input.payee ?? "").trim(); const amount = Number(input.amount); const currency = String(input.currency ?? "EUR").trim().toUpperCase(); const key = String(input.idempotencyKey ?? "").trim(); if (!payee || payee.length > 120) throw badRequest("A verified sandbox payee is required."); if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) throw badRequest("Sandbox payment amount must be between 0 and 10,000."); if (!/^[A-Z]{3}$/.test(currency)) throw badRequest("Currency must use a three-letter code."); if (!key) throw badRequest("Idempotency key is required."); const values = { connectionId: "finance-sandbox", payeeId: `sandbox:${payee}`, payee, amount, currency, approvalRequestId: `sandbox-approval:${key}` }; let plan = validateLifeActionPlan(createLifeActionPlan({ capabilityKey: "finance.payment.create", executionLevel: "transact", providerId: "finance-sandbox", idempotencyKey: key, values })); plan = nextLifeActionState(plan); const saved = await persistLifeActionPlan(input.userId, plan); if (saved.state === "confirmed") return serializeLifeTransaction(saved); if (saved.state !== "awaiting_approval") throw badRequest("This payment simulation is already being processed."); await transitionPersistedLifeTransaction({ userId: input.userId, id: saved.id, next: "executing" }); const reference = `PAY-SIM-${createHash("sha256").update(key).digest("hex").slice(0, 8).toUpperCase()}`; return transitionPersistedLifeTransaction({ userId: input.userId, id: saved.id, next: "confirmed", externalReference: reference, result: { sandbox: true, simulated: true, moneyMoved: false, status: "simulated", payee, amount, currency, reference, notice: "Simulation only. No bank, payee, account, or payment network was contacted." } }); }

export async function cancelSandboxPayment(input: { userId: string; id: string; confirmed: unknown }) { if (input.confirmed !== true) throw badRequest("Explicit payment-simulation cancellation confirmation is required."); const payment = await prisma.lifeTransaction.findFirst({ where: { id: input.id, userId: input.userId, capabilityKey: "finance.payment.create", providerId: "finance-sandbox", state: "confirmed" } }); if (!payment) throw badRequest("A confirmed sandbox payment simulation was not found."); return transitionPersistedLifeTransaction({ userId: input.userId, id: payment.id, next: "cancelled", result: { sandbox: true, simulated: true, moneyMoved: false, status: "cancelled", reference: payment.externalReference } }); }
