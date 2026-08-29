import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";
import { verifyConnectorState } from "./cryptoService.js";
import { createHitlRequest } from "./hitlService.js";
import { createInstacartShoppingPage, type InstacartLineItem } from "./instacartProvider.js";
import { decodeJson, encodeJson } from "./jsonService.js";
import { serializeLifeTransaction, transitionPersistedLifeTransaction } from "./lifeTransactionService.js";

function requireFeature() { if (env.LIVE_SHOPPING_ENABLED !== "true" || env.HOSTED_SHOPPING_CHECKOUT_ENABLED !== "true") throw httpError(503, "Hosted shopping is not enabled for this environment.", "hosted_shopping_disabled"); }
function cleanItems(value: unknown): InstacartLineItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw httpError(400, "Provide between 1 and 100 shopping-list items.", "invalid_shopping_items");
  const seen = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw httpError(400, `Shopping item ${index + 1} is invalid.`, "invalid_shopping_item");
    const row = raw as Record<string, unknown>; const name = String(row.name ?? "").trim(); const quantity = Number(row.quantity ?? 1);
    if (!name || name.length > 160 || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw httpError(400, `Shopping item ${index + 1} is invalid.`, "invalid_shopping_item");
    const key = name.toLocaleLowerCase(); if (seen.has(key)) throw httpError(400, "Duplicate shopping-list items must be combined before approval.", "duplicate_shopping_item"); seen.add(key);
    return { name, quantity, unit: "each" };
  });
}
function cartHash(title: string, items: InstacartLineItem[]) { return createHash("sha256").update(JSON.stringify({ title, items })).digest("hex"); }

export async function prepareHostedShopping(input: { userId: string; agentId: string; title: string; items: unknown; idempotencyKey: string }) {
  requireFeature(); const title = input.title.trim(); if (!title || title.length > 100) throw httpError(400, "A valid shopping-list title is required.", "invalid_shopping_title");
  const items = cleanItems(input.items); const hash = cartHash(title, items);
  const existing = await prisma.lifeTransaction.findUnique({ where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } } });
  if (existing) {
    const stored = decodeJson<Record<string, unknown>>(existing.inputJson, {}); if (stored.cartHash !== hash) throw httpError(409, "This idempotency key is already bound to a different shopping list.", "shopping_idempotency_conflict");
    return { transaction: serializeLifeTransaction(existing), replayed: true };
  }
  const payload = { action: "open_instacart_shopping_page", providerId: "instacart", title, items, cartHash: hash, priceKnown: false, purchaseOccursExternally: true };
  const approval = await createHitlRequest({ userId: input.userId, agentId: input.agentId, actionName: "shopping.hosted_checkout", payload, ttlMinutes: 10 });
  const transaction = await prisma.lifeTransaction.create({ data: { userId: input.userId, capabilityKey: "shopping.list.manage", executionLevel: "redirect", state: "awaiting_approval", providerId: "instacart", providerCandidatesJson: encodeJson(["instacart"]), approvalRequired: true, idempotencyKey: input.idempotencyKey, inputJson: encodeJson({ title, items, cartHash: hash, approvalRequestId: approval.id, priceKnown: false }), hitlRequestId: approval.id } });
  return { transaction: serializeLifeTransaction(transaction), approvalRequestId: approval.id, replayed: false, disclosure: "Prices, availability, substitutions, fees, taxes, and final purchase are reviewed and completed on Instacart." };
}

export async function continueHostedShopping(input: { userId: string; transactionId: string }) {
  requireFeature(); const transaction = await prisma.lifeTransaction.findFirst({ where: { id: input.transactionId, userId: input.userId } });
  if (!transaction?.hitlRequestId) throw httpError(404, "A prepared hosted-shopping transaction was not found.", "shopping_checkout_not_found");
  if (transaction.state === "executing") return { transaction: serializeLifeTransaction(transaction), checkoutUrl: null, replayed: true };
  if (transaction.state !== "awaiting_approval") throw httpError(409, "This shopping handoff is not waiting for approval.", "shopping_checkout_not_pending");
  const approval = await prisma.hitlRequest.findFirst({ where: { id: transaction.hitlRequestId, userId: input.userId, status: "success", expiresAt: { gt: new Date() } } });
  if (!approval) throw httpError(409, "Approve this exact shopping list before continuing.", "shopping_checkout_approval_required");
  const signed = decodeJson<Record<string, unknown>>(approval.payload, {}); const binding = typeof signed.approvalBinding === "string" ? signed.approvalBinding : ""; const verified = verifyConnectorState<Record<string, unknown>>(binding); const unsigned = Object.fromEntries(Object.entries(signed).filter(([key]) => key !== "approvalBinding"));
  if (!verified || JSON.stringify(verified) !== JSON.stringify(unsigned)) throw httpError(409, "The shopping approval payload changed.", "shopping_checkout_approval_invalid");
  const stored = decodeJson<{ title?: unknown; items?: unknown; cartHash?: unknown }>(transaction.inputJson, {}); const title = String(stored.title ?? ""); const items = cleanItems(stored.items);
  if (stored.cartHash !== cartHash(title, items) || unsigned.cartHash !== stored.cartHash) throw httpError(409, "The approved shopping list changed.", "shopping_cart_changed");
  const claimed = await prisma.lifeTransaction.updateMany({ where: { id: transaction.id, userId: input.userId, state: "awaiting_approval" }, data: { state: "executing" } });
  if (!claimed.count) {
    const current = await prisma.lifeTransaction.findFirstOrThrow({ where: { id: transaction.id, userId: input.userId } });
    return { transaction: serializeLifeTransaction(current), checkoutUrl: null, replayed: true };
  }
  try {
    const checkoutUrl = await createInstacartShoppingPage({ title, items, expiresInDays: 1, linkbackUrl: env.APP_PUBLIC_URL });
    const result = { status: "redirected_to_hosted_checkout", providerId: "instacart", checkoutHost: new URL(checkoutUrl).hostname, returnIsConfirmation: false, purchaseStatusAvailable: false, expiresWithinDays: 1 };
    const executing = await prisma.lifeTransaction.update({ where: { id: transaction.id }, data: { resultJson: encodeJson(result) } });
    return { transaction: serializeLifeTransaction(executing), checkoutUrl, replayed: false, disclosure: "Opening this page does not confirm an order. Review the matched products and final total on Instacart." };
  } catch (error) {
    await transitionPersistedLifeTransaction({ userId: input.userId, id: transaction.id, next: "uncertain", result: { status: "shopping_page_creation_uncertain", providerId: "instacart", retryAutomatically: false, reason: "The provider does not expose idempotent creation or link lookup." } });
    throw error;
  }
}
