import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";
import { verifyConnectorState } from "./cryptoService.js";
import { getHouseholdProviderDestination } from "./googlePlacesHouseholdProvider.js";
import { createHitlRequest } from "./hitlService.js";
import { decodeJson, encodeJson } from "./jsonService.js";
import { serializeLifeTransaction } from "./lifeTransactionService.js";

function requireHandoff() { if (env.LIVE_HOUSEHOLD_ENABLED !== "true" || env.HOSTED_HOUSEHOLD_HANDOFF_ENABLED !== "true") throw httpError(503, "Hosted household handoff is not enabled for this environment.", "hosted_household_disabled"); }
function clean(value: unknown, label: string, max: number) { const text = String(value ?? "").trim(); if (!text || text.length > max) throw httpError(400, `${label} is invalid.`, "invalid_household_request"); return text; }
function requestHash(value: Record<string, string>) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export async function prepareHostedHouseholdHandoff(input: { userId: string; agentId: string; placeId: string; serviceType: string; location: string; description: string; idempotencyKey: string }) {
  requireHandoff(); const request = { placeId: clean(input.placeId, "Place ID", 300), serviceType: clean(input.serviceType, "Service type", 100), location: clean(input.location, "Location", 160), description: clean(input.description, "Description", 500) }; const hash = requestHash(request);
  const existing = await prisma.lifeTransaction.findUnique({ where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } } });
  if (existing) { const stored = decodeJson<Record<string, unknown>>(existing.inputJson, {}); if (stored.requestHash !== hash) throw httpError(409, "This idempotency key is already bound to another service request.", "household_idempotency_conflict"); return { transaction: serializeLifeTransaction(existing), replayed: true }; }
  const payload = { action: "open_household_provider_website", providerId: "google-places", ...request, requestHash: hash, quoteKnown: false, bookingOccursExternally: true };
  const approval = await createHitlRequest({ userId: input.userId, agentId: input.agentId, actionName: "household.hosted_handoff", payload, ttlMinutes: 10 });
  const transaction = await prisma.lifeTransaction.create({ data: { userId: input.userId, capabilityKey: "household.provider.search", executionLevel: "redirect", state: "awaiting_approval", providerId: "google-places", providerCandidatesJson: encodeJson(["google-places"]), approvalRequired: true, idempotencyKey: input.idempotencyKey, inputJson: encodeJson({ ...request, requestHash: hash, approvalRequestId: approval.id }), hitlRequestId: approval.id } });
  return { transaction: serializeLifeTransaction(transaction), approvalRequestId: approval.id, replayed: false, disclosure: "No quote or booking has been created. The provider website controls availability, pricing, terms, and any later transaction." };
}

export async function continueHostedHouseholdHandoff(input: { userId: string; transactionId: string }) {
  requireHandoff(); const transaction = await prisma.lifeTransaction.findFirst({ where: { id: input.transactionId, userId: input.userId } });
  if (!transaction?.hitlRequestId) throw httpError(404, "A prepared household handoff was not found.", "household_handoff_not_found");
  if (transaction.state === "executing") return { transaction: serializeLifeTransaction(transaction), destinationUrl: null, replayed: true };
  if (transaction.state !== "awaiting_approval") throw httpError(409, "This household handoff is not waiting for approval.", "household_handoff_not_pending");
  const approval = await prisma.hitlRequest.findFirst({ where: { id: transaction.hitlRequestId, userId: input.userId, status: "success", expiresAt: { gt: new Date() } } }); if (!approval) throw httpError(409, "Approve this exact provider handoff before continuing.", "household_handoff_approval_required");
  const signed = decodeJson<Record<string, unknown>>(approval.payload, {}); const binding = typeof signed.approvalBinding === "string" ? signed.approvalBinding : ""; const verified = verifyConnectorState<Record<string, unknown>>(binding); const unsigned = Object.fromEntries(Object.entries(signed).filter(([key]) => key !== "approvalBinding")); if (!verified || JSON.stringify(verified) !== JSON.stringify(unsigned)) throw httpError(409, "The household approval payload changed.", "household_handoff_approval_invalid");
  const stored = decodeJson<Record<string, unknown>>(transaction.inputJson, {}); const request = { placeId: String(stored.placeId ?? ""), serviceType: String(stored.serviceType ?? ""), location: String(stored.location ?? ""), description: String(stored.description ?? "") }; if (stored.requestHash !== requestHash(request) || unsigned.requestHash !== stored.requestHash) throw httpError(409, "The approved service request changed.", "household_request_changed");
  const destinationUrl = await getHouseholdProviderDestination(request.placeId);
  const claimed = await prisma.lifeTransaction.updateMany({ where: { id: transaction.id, userId: input.userId, state: "awaiting_approval" }, data: { state: "executing", resultJson: encodeJson({ status: "redirected_to_provider_website", providerId: "google-places", destinationHost: new URL(destinationUrl).hostname, returnIsConfirmation: false, quoteKnown: false, bookingStatusAvailable: false }) } });
  if (!claimed.count) { const current = await prisma.lifeTransaction.findFirstOrThrow({ where: { id: transaction.id, userId: input.userId } }); return { transaction: serializeLifeTransaction(current), destinationUrl: null, replayed: true }; }
  const current = await prisma.lifeTransaction.findFirstOrThrow({ where: { id: transaction.id, userId: input.userId } }); return { transaction: serializeLifeTransaction(current), destinationUrl, replayed: false, disclosure: "Opening the provider website does not request a quote or confirm a booking." };
}
