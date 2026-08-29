import { createHash } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { badRequest } from "../errors/httpError.js";
import { createLifeActionPlan, nextLifeActionState, persistLifeActionPlan, serializeLifeTransaction, transitionPersistedLifeTransaction, validateLifeActionPlan } from "./lifeTransactionService.js";

export type SandboxHouseholdProvider = { id: string; name: string; serviceType: string; location: string; rating: number; reviewCount: number; verified: boolean; mode: "sandbox" };
export type SandboxHouseholdQuote = { id: string; provider: SandboxHouseholdProvider; description: string; amount: string; currency: string; estimatedMinutes: number; availableAt: string; expiresAt: string; mode: "sandbox" };

function required(value: unknown, label: string, max = 300) { const result = String(value ?? "").trim(); if (!result) throw badRequest(`${label} is required.`); if (result.length > max) throw badRequest(`${label} is too long.`); return result; }

export function searchSandboxHouseholdProviders(input: { serviceType?: unknown; location?: unknown; description?: unknown }) {
  const serviceType = required(input.serviceType, "Service type", 100); const location = required(input.location, "Location", 120); required(input.description, "Description");
  const suffix = createHash("sha256").update(`${serviceType}|${location}`).digest("hex").slice(0, 8);
  return [
    { id: `household-sandbox-local-${suffix}`, name: "Sandbox Home Services", serviceType, location, rating: 4.8, reviewCount: 126, verified: true, mode: "sandbox" },
    { id: `household-sandbox-independent-${suffix}`, name: "Example Local Professional", serviceType, location, rating: 4.5, reviewCount: 54, verified: true, mode: "sandbox" }
  ] satisfies SandboxHouseholdProvider[];
}

function cleanProvider(value: unknown): SandboxHouseholdProvider { if (!value || typeof value !== "object") throw badRequest("A complete sandbox provider is required."); const item = value as Partial<SandboxHouseholdProvider>; if (!String(item.id ?? "").startsWith("household-sandbox-") || item.mode !== "sandbox") throw badRequest("Only sandbox providers can quote here."); return { id: String(item.id), name: required(item.name, "Provider name"), serviceType: required(item.serviceType, "Service type"), location: required(item.location, "Location"), rating: Number(item.rating), reviewCount: Number(item.reviewCount), verified: item.verified === true, mode: "sandbox" }; }

export function quoteSandboxHouseholdService(input: { provider: unknown; description?: unknown; currency?: unknown }) {
  const provider = cleanProvider(input.provider); const description = required(input.description, "Description"); const currency = /^[A-Z]{3}$/.test(String(input.currency ?? "EUR").toUpperCase()) ? String(input.currency ?? "EUR").toUpperCase() : "EUR";
  const suffix = createHash("sha256").update(`${provider.id}|${description}`).digest("hex").slice(0, 8);
  const base = provider.name.startsWith("Sandbox") ? 89 : 109;
  return { id: `quote-sandbox-${suffix}`, provider, description, amount: `${base}.00`, currency, estimatedMinutes: 90, availableAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), mode: "sandbox" } satisfies SandboxHouseholdQuote;
}

function cleanQuote(value: unknown): SandboxHouseholdQuote { if (!value || typeof value !== "object") throw badRequest("A complete sandbox quote is required."); const item = value as Partial<SandboxHouseholdQuote>; if (!String(item.id ?? "").startsWith("quote-sandbox-") || item.mode !== "sandbox" || Date.parse(String(item.expiresAt)) <= Date.now()) throw badRequest("The sandbox quote is invalid or expired."); return { id: String(item.id), provider: cleanProvider(item.provider), description: required(item.description, "Description"), amount: required(item.amount, "Amount"), currency: required(item.currency, "Currency"), estimatedMinutes: Number(item.estimatedMinutes), availableAt: new Date(String(item.availableAt)).toISOString(), expiresAt: new Date(String(item.expiresAt)).toISOString(), mode: "sandbox" }; }

export async function bookSandboxHouseholdService(input: { userId: string; quote: unknown; confirmed: unknown; idempotencyKey: unknown }) {
  if (input.confirmed !== true) throw badRequest("Explicit service booking confirmation is required."); const quote = cleanQuote(input.quote); const idempotencyKey = required(input.idempotencyKey, "Idempotency key", 200);
  const values = { quote, quoteId: quote.id, maxApprovedTotal: Number(quote.amount), approvalRequestId: `sandbox-approval:${idempotencyKey}` };
  let plan = validateLifeActionPlan(createLifeActionPlan({ capabilityKey: "household.service.book", executionLevel: "transact", providerId: "life-sandbox", idempotencyKey, values })); plan = nextLifeActionState(plan);
  const saved = await persistLifeActionPlan(input.userId, plan); if (saved.state === "confirmed") return serializeLifeTransaction(saved); if (saved.state !== "awaiting_approval") throw badRequest("This service booking is already being processed.");
  await transitionPersistedLifeTransaction({ userId: input.userId, id: saved.id, next: "executing" }); const reference = `HOME-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 8).toUpperCase()}`;
  return transitionPersistedLifeTransaction({ userId: input.userId, id: saved.id, next: "confirmed", externalReference: reference, result: { sandbox: true, status: "confirmed", bookingReference: reference, quote } });
}

export async function cancelSandboxHouseholdService(input: { userId: string; transactionId: string; confirmed: unknown }) { if (input.confirmed !== true) throw badRequest("Explicit service cancellation confirmation is required."); const booking = await prisma.lifeTransaction.findFirst({ where: { id: input.transactionId, userId: input.userId, capabilityKey: "household.service.book", providerId: "life-sandbox", state: "confirmed" } }); if (!booking) throw badRequest("A confirmed sandbox service booking was not found."); return transitionPersistedLifeTransaction({ userId: input.userId, id: booking.id, next: "cancelled", result: { sandbox: true, status: "cancelled", bookingReference: booking.externalReference } }); }
