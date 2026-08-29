import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";
import { verifyConnectorState } from "./cryptoService.js";
import { enqueueDurableJob } from "./durableJobService.js";
import { createHitlRequest } from "./hitlService.js";
import { decodeJson } from "./jsonService.js";
import { persistAwaitingLifeApproval, serializeLifeTransaction, transitionPersistedLifeTransaction } from "./lifeTransactionService.js";
import { normalizedFlightOfferSchema, normalizedHotelOfferSchema } from "./travelOfferService.js";

const checkoutHosts = new Set(env.TRAVEL_CHECKOUT_HOSTS.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));

function requireTravelFeature() {
  if (env.LIVE_TRAVEL_ENABLED !== "true" || env.HOSTED_TRAVEL_CHECKOUT_ENABLED !== "true") {
    throw httpError(503, "Hosted travel checkout is not enabled for this environment.", "hosted_travel_checkout_disabled");
  }
}

function parseOffer(value: unknown) {
  const flight = normalizedFlightOfferSchema.safeParse(value);
  if (flight.success) return flight.data;
  const hotel = normalizedHotelOfferSchema.safeParse(value);
  if (hotel.success) return hotel.data;
  throw httpError(400, "A valid normalized live travel offer is required.", "invalid_travel_offer");
}

function validateCheckoutUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw httpError(400, "The provider checkout URL is invalid.", "invalid_checkout_url"); }
  if (url.protocol !== "https:" || !checkoutHosts.has(url.hostname.toLowerCase())) {
    throw httpError(400, "The provider checkout host is not allowlisted.", "checkout_host_not_allowed");
  }
  return url;
}

export async function prepareHostedTravelCheckout(input: { userId: string; agentId: string; offer?: unknown; idempotencyKey: string; acceptedAmount: string; acceptedCurrency: string; priceChangeAccepted?: boolean }) {
  requireTravelFeature();
  const offer = parseOffer(input.offer);
  if (offer.inventoryMode !== "live") throw httpError(400, "Sandbox offers cannot enter hosted checkout.", "sandbox_checkout_blocked");
  if (Date.parse(offer.expiresAt) <= Date.now()) throw httpError(409, "This offer expired and must be repriced.", "travel_offer_expired");
  const acceptedAmount = input.acceptedAmount.trim();
  const acceptedCurrency = input.acceptedCurrency.trim().toUpperCase();
  if (offer.price.amount !== acceptedAmount || offer.price.currency !== acceptedCurrency) {
    throw httpError(409, "The offer price changed. Review and accept the repriced amount.", "travel_price_changed");
  }
  if (input.priceChangeAccepted === false) throw httpError(409, "The repriced amount was not accepted.", "travel_price_not_accepted");
  const existing = await prisma.lifeTransaction.findUnique({ where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } } });
  if (existing) return { transaction: serializeLifeTransaction(existing), replayed: true };
  const approvalPayload = { action: "open_hosted_travel_checkout", providerId: offer.providerId, offerId: offer.providerOfferId, kind: offer.kind, amount: offer.price.amount, currency: offer.price.currency, expiresAt: offer.expiresAt };
  const approval = await createHitlRequest({ userId: input.userId, agentId: input.agentId, actionName: "travel.hosted_checkout", payload: approvalPayload, ttlMinutes: 10 });
  const transaction = await persistAwaitingLifeApproval({
    userId: input.userId,
    capabilityKey: offer.kind === "flight" ? "travel.flight.book" : "travel.hotel.book",
    providerId: offer.providerId,
    idempotencyKey: input.idempotencyKey,
    hitlRequestId: approval.id,
    values: { selectedOfferId: offer.providerOfferId, maxApprovedTotal: Number(offer.price.amount), currency: offer.price.currency, approvalRequestId: approval.id, offerExpiresAt: offer.expiresAt, inventoryMode: "live" }
  });
  return { transaction: serializeLifeTransaction(transaction), approvalRequestId: approval.id, replayed: false };
}

export async function continueHostedTravelCheckout(input: { userId: string; transactionId: string; checkoutUrl: string }) {
  requireTravelFeature();
  const transaction = await prisma.lifeTransaction.findFirst({ where: { id: input.transactionId, userId: input.userId } });
  if (!transaction?.hitlRequestId) throw httpError(404, "A prepared hosted-checkout transaction was not found.", "travel_checkout_not_found");
  if (transaction.state === "executing") {
    return { transaction: serializeLifeTransaction(transaction), checkoutUrl: null, replayed: true };
  }
  if (transaction.state !== "awaiting_approval") throw httpError(409, "This checkout is not waiting for approval.", "travel_checkout_not_pending");
  const approval = await prisma.hitlRequest.findFirst({ where: { id: transaction.hitlRequestId, userId: input.userId, status: "success", expiresAt: { gt: new Date() } } });
  if (!approval) throw httpError(409, "Approve this exact checkout before continuing.", "travel_checkout_approval_required");
  const stored = decodeJson<Record<string, unknown>>(approval.payload, {});
  const binding = typeof stored.approvalBinding === "string" ? stored.approvalBinding : "";
  const verified = verifyConnectorState<Record<string, unknown>>(binding);
  const unsigned = Object.fromEntries(Object.entries(stored).filter(([key]) => key !== "approvalBinding"));
  if (!verified || JSON.stringify(verified) !== JSON.stringify(unsigned)) throw httpError(409, "The checkout approval payload changed.", "travel_checkout_approval_invalid");
  const url = validateCheckoutUrl(input.checkoutUrl);
  const executing = await transitionPersistedLifeTransaction({ userId: input.userId, id: transaction.id, next: "executing", result: { status: "redirected_to_hosted_checkout", providerId: transaction.providerId, checkoutHost: url.hostname, returnIsConfirmation: false } });
  await enqueueDurableJob({ jobType: "checkout_confirmation", dedupeKey: `checkout-confirmation:${transaction.id}`, payload: { transactionId: transaction.id, providerId: transaction.providerId }, userId: input.userId, aggregateType: "life_transaction", aggregateId: transaction.id, correlationId: transaction.id });
  return { transaction: executing, checkoutUrl: url.toString(), replayed: false };
}
