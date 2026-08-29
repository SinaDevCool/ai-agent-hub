import { createHash } from "node:crypto";
import { badRequest } from "../errors/httpError.js";
import { createLifeActionPlan, nextLifeActionState, persistLifeActionPlan, serializeLifeTransaction, transitionPersistedLifeTransaction, validateLifeActionPlan } from "./lifeTransactionService.js";
import { prisma } from "../db/prisma.js";
import { decodeJson, encodeJson } from "./jsonService.js";

export type SandboxProductOffer = { id: string; title: string; merchant: string; amount: string; currency: string; inStock: boolean; checkoutMode: "sandbox"; expiresAt: string };

function text(value: unknown, label: string) { const result = String(value ?? "").trim(); if (!result) throw badRequest(`${label} is required.`); if (result.length > 160) throw badRequest(`${label} is too long.`); return result; }

export function searchSandboxProducts(input: { query?: unknown; currency?: unknown }) {
  const query = text(input.query, "Search query");
  const currency = /^[A-Z]{3}$/.test(String(input.currency ?? "EUR").toUpperCase()) ? String(input.currency ?? "EUR").toUpperCase() : "EUR";
  const suffix = createHash("sha256").update(query.toLowerCase()).digest("hex").slice(0, 8);
  const expiresAt = new Date(Date.now() + 20 * 60_000).toISOString();
  return [
    { id: `shopping-sandbox-value-${suffix}`, title: `${query} — value option`, merchant: "Sandbox Market", amount: "39.90", currency, inStock: true, checkoutMode: "sandbox", expiresAt },
    { id: `shopping-sandbox-premium-${suffix}`, title: `${query} — premium option`, merchant: "Example Shop", amount: "79.00", currency, inStock: true, checkoutMode: "sandbox", expiresAt }
  ] satisfies SandboxProductOffer[];
}

function offer(value: unknown): SandboxProductOffer {
  if (!value || typeof value !== "object") throw badRequest("A complete sandbox product offer is required.");
  const item = value as Partial<SandboxProductOffer>;
  if (!String(item.id ?? "").startsWith("shopping-sandbox-") || item.checkoutMode !== "sandbox") throw badRequest("Only sandbox products can be ordered here.");
  if (Date.parse(String(item.expiresAt)) <= Date.now()) throw badRequest("This product offer expired. Search again.");
  return { id: String(item.id), title: text(item.title, "Product title"), merchant: text(item.merchant, "Merchant"), amount: text(item.amount, "Amount"), currency: text(item.currency, "Currency"), inStock: item.inStock === true, checkoutMode: "sandbox", expiresAt: String(item.expiresAt) };
}

export function prepareSandboxCheckout(input: { offer: unknown; quantity: unknown }) {
  const item = offer(input.offer); const quantity = Number(input.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw badRequest("Quantity must be between 1 and 20.");
  return { sandbox: true, offer: item, quantity, total: (Number(item.amount) * quantity).toFixed(2), currency: item.currency, approvalRequired: true, checkoutUrl: null, notice: "No merchant is contacted. Confirm to create a sandbox order." };
}

export async function orderSandboxProduct(input: { userId: string; offer: unknown; quantity: unknown; confirmed: unknown; idempotencyKey: unknown }) {
  if (input.confirmed !== true) throw badRequest("Explicit order confirmation is required.");
  const checkout = prepareSandboxCheckout(input); const idempotencyKey = text(input.idempotencyKey, "Idempotency key");
  const contractValues = { ...checkout, cartId: checkout.offer.id, maxApprovedTotal: Number(checkout.total), approvalRequestId: `sandbox-approval:${idempotencyKey}` };
  let plan = validateLifeActionPlan(createLifeActionPlan({ capabilityKey: "shopping.order.create", executionLevel: "transact", providerId: "life-sandbox", idempotencyKey, values: contractValues }));
  plan = nextLifeActionState(plan);
  const saved = await persistLifeActionPlan(input.userId, plan);
  if (saved.state === "confirmed") return serializeLifeTransaction(saved);
  if (saved.state !== "awaiting_approval") throw badRequest("This order is already being processed.");
  await transitionPersistedLifeTransaction({ userId: input.userId, id: saved.id, next: "executing" });
  const reference = `ORDER-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 8).toUpperCase()}`;
  return transitionPersistedLifeTransaction({ userId: input.userId, id: saved.id, next: "confirmed", externalReference: reference, result: { ...checkout, status: "confirmed", orderReference: reference } });
}

export async function cancelSandboxOrder(input: { userId: string; transactionId: string; confirmed: unknown }) {
  if (input.confirmed !== true) throw badRequest("Explicit order cancellation confirmation is required.");
  const order = await prisma.lifeTransaction.findFirst({ where: { id: input.transactionId, userId: input.userId, capabilityKey: "shopping.order.create", providerId: "life-sandbox", state: "confirmed" } });
  if (!order) throw badRequest("A confirmed sandbox order was not found.");
  return transitionPersistedLifeTransaction({ userId: input.userId, id: order.id, next: "cancelled", result: { sandbox: true, status: "cancelled", orderReference: order.externalReference } });
}

export type ShoppingListItem = { id: string; name: string; quantity: number; checked: boolean };
function cleanListName(value: unknown) { const name = text(value, "List name"); if (name.length > 80) throw badRequest("List name is too long."); return name; }
function cleanListItems(value: unknown): ShoppingListItem[] { if (!Array.isArray(value)) throw badRequest("Shopping-list items must be an array."); if (value.length > 200) throw badRequest("A shopping list can contain at most 200 items."); return value.map((item, index) => { if (!item || typeof item !== "object") throw badRequest(`Shopping-list item ${index + 1} is invalid.`); const row = item as Record<string, unknown>; const name = text(row.name, `Item ${index + 1} name`); const quantity = Number(row.quantity ?? 1); if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw badRequest(`Item ${index + 1} quantity is invalid.`); return { id: String(row.id ?? `item-${createHash("sha256").update(`${index}:${name}`).digest("hex").slice(0, 8)}`), name, quantity, checked: row.checked === true }; }); }
function serializeList(value: { id: string; name: string; itemsJson: string; createdAt: Date; updatedAt: Date }) { return { id: value.id, name: value.name, items: decodeJson<ShoppingListItem[]>(value.itemsJson, []), createdAt: value.createdAt, updatedAt: value.updatedAt }; }
export async function listShoppingLists(userId: string) { return (await prisma.shoppingList.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } })).map(serializeList); }
export async function saveShoppingList(input: { userId: string; name: unknown; items: unknown }) { const name = cleanListName(input.name); const items = cleanListItems(input.items); return serializeList(await prisma.shoppingList.upsert({ where: { userId_name: { userId: input.userId, name } }, update: { itemsJson: encodeJson(items) }, create: { userId: input.userId, name, itemsJson: encodeJson(items) } })); }
export async function deleteShoppingList(input: { userId: string; id: string }) { const result = await prisma.shoppingList.deleteMany({ where: { id: input.id, userId: input.userId } }); if (!result.count) throw badRequest("Shopping list not found."); return { deleted: true }; }
