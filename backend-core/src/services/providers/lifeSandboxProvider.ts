import { createHash, randomUUID } from "node:crypto";
import { getLifeCapability, lifeProviders } from "../lifePlatformCatalog.js";
import { lifeProviderActionContract } from "./lifeProviderActionContractService.js";
import type { ProviderAdapter, ProviderExecutionInput, ProviderExecutionResult } from "./providerAdapterTypes.js";

const catalogProvider = lifeProviders.find((provider) => provider.id === "life-sandbox");
if (!catalogProvider) throw new Error("Life sandbox catalog entry is missing.");

function toolRunId(input: ProviderExecutionInput) { return input.previousToolRunId ?? `sandbox-${randomUUID()}`; }
function reference(prefix: string, input: ProviderExecutionInput) { return `${prefix}_${createHash("sha256").update(input.idempotencyKey ?? JSON.stringify(input.input)).digest("hex").slice(0, 12)}`; }
function missing(input: ProviderExecutionInput, fields: string[]): ProviderExecutionResult | null {
  const absent = fields.filter((field) => input.input[field] === undefined || input.input[field] === "" || (Array.isArray(input.input[field]) && input.input[field].length === 0));
  if (!absent.length) return null;
  return { status: "blocked", toolRunId: toolRunId(input), reason: `Missing ${absent.join(", ")}.`, code: "invalid_input", userMessage: `Add ${absent.join(", ")} to continue.`, nextAction: "add_missing_info", retryable: false };
}
function ok(input: ProviderExecutionInput, result: Record<string, unknown>, actionName?: string): ProviderExecutionResult {
  return { status: "ok", toolRunId: toolRunId(input), actionName, result: { sandbox: true, simulated: true, externalSystemsContacted: false, ...result } };
}
function validateContract(input: ProviderExecutionInput) {
  const capability = getLifeCapability(input.capability.key);
  if (!capability) return null;
  const contract = lifeProviderActionContract({ capabilityKey: capability.key, action: input.action, riskLevel: capability.risk, requiresApproval: capability.approvalRequired });
  return contract ? missing(input, contract.requiredFields) : null;
}

function execute(input: ProviderExecutionInput): Promise<ProviderExecutionResult> {
  const invalid = validateContract(input);
  if (invalid) return Promise.resolve(invalid);
  const key = input.capability.key;
  const value = input.input;
  if (key === "travel.flight.search") return Promise.resolve(ok(input, { offers: [{ id: "sandbox-flight-flex", carrier: "Sandbox Air", origin: value.origin, destination: value.destination, departureDate: value.departureDate, amount: 249, currency: value.currency ?? "EUR", refundable: true }, { id: "sandbox-flight-light", carrier: "Example Airways", origin: value.origin, destination: value.destination, departureDate: value.departureDate, amount: 189, currency: value.currency ?? "EUR", refundable: false }] }));
  if (key === "travel.flight.book") return Promise.resolve(ok(input, { status: input.action === "cancel" ? "cancelled" : "confirmed", orderId: reference("flight", input), selectedOfferId: value.selectedOfferId, moneyCharged: false }, "Sandbox flight operation simulated"));
  if (key === "travel.hotel.search") return Promise.resolve(ok(input, { offers: [{ id: "sandbox-hotel-flex", name: "Example Central Hotel", destination: value.destination, total: 420, currency: value.currency ?? "EUR", refundable: true }, { id: "sandbox-hotel-value", name: "Sample Garden Stay", destination: value.destination, total: 310, currency: value.currency ?? "EUR", refundable: false }] }));
  if (key === "travel.hotel.book") return Promise.resolve(ok(input, { status: input.action === "cancel" ? "cancelled" : "confirmed", orderId: reference("hotel", input), selectedOfferId: value.selectedOfferId, moneyCharged: false }, "Sandbox hotel operation simulated"));
  if (key === "travel.ground.search") return Promise.resolve(ok(input, { offers: [{ id: "sandbox-rail", mode: "rail", origin: value.origin, destination: value.destination, departureDate: value.departureDate, total: 49, currency: value.currency ?? "EUR" }] }));
  if (key === "travel.itinerary.manage") return Promise.resolve(ok(input, { itineraryId: reference("itinerary", input), operation: value.operation, items: value.transactionIds ?? [], status: "prepared" }));
  if (key === "appointments.provider.search") return Promise.resolve(ok(input, { providers: [{ id: "sandbox-clinic", name: "Example Care Clinic", specialty: value.specialty, location: value.location }] }));
  if (key === "appointments.availability.search") return Promise.resolve(ok(input, { slots: [{ id: "sandbox-slot-morning", providerId: value.providerId, startsAt: `${String(value.startDate).slice(0, 10)}T09:00:00Z` }] }));
  if (key === "appointments.booking.manage") return Promise.resolve(ok(input, { appointmentId: reference("appointment", input), operation: value.operation, status: value.operation === "cancel" ? "cancelled" : "confirmed", providerId: value.providerId, careDelivered: false }, "Sandbox appointment change simulated"));
  if (key === "shopping.product.search") return Promise.resolve(ok(input, { offers: [{ id: "sandbox-product", title: `Example ${value.query}`, region: value.region, price: 79.99, currency: value.currency ?? "EUR" }] }));
  if (key === "shopping.list.manage") return Promise.resolve(ok(input, { listId: reference("list", input), operation: value.operation, items: value.items, status: "saved_in_simulation" }));
  if (key === "shopping.order.create") return Promise.resolve(ok(input, { orderId: reference("retail", input), cartId: value.cartId, status: input.action === "cancel" ? "cancelled" : "confirmed", moneyCharged: false }, "Sandbox retail order simulated"));
  if (key === "household.provider.search") return Promise.resolve(ok(input, { providers: [{ id: "sandbox-home-pro", name: "Example Home Services", serviceType: value.serviceType, location: value.location, rating: 4.8 }] }));
  if (key === "household.quote.manage") return Promise.resolve(ok(input, { quoteId: reference("quote", input), operation: value.operation, serviceRequestId: value.serviceRequestId, total: 120, currency: value.currency ?? "EUR" }));
  if (key === "household.service.book") return Promise.resolve(ok(input, { bookingId: reference("service", input), quoteId: value.quoteId, status: input.action === "cancel" ? "cancelled" : "confirmed", moneyCharged: false }, "Sandbox household service simulated"));
  if (key === "leisure.restaurant.reserve") return Promise.resolve(ok(input, { reservationId: reference("table", input), restaurantId: value.restaurantId, dateTime: value.dateTime, partySize: value.partySize, status: input.action === "cancel" ? "cancelled" : "confirmed", moneyCharged: false }, "Sandbox restaurant reservation simulated"));
  if (key === "leisure.event.search") return Promise.resolve(ok(input, { events: [{ id: "sandbox-event", title: "Example Local Event", location: value.location, startsAt: value.startDate, ticketUrl: null }] }));
  if (key === "home.device.read") return Promise.resolve(ok(input, { devices: (value.entityIds as unknown[]).map((entityId) => ({ entityId, state: "off", source: "sandbox" })) }));
  if (key === "home.device.control") return Promise.resolve(ok(input, { commandId: reference("device", input), entityId: value.entityId, command: value.command, status: "simulated", physicalDeviceChanged: false }, "Sandbox smart-home command simulated"));
  if (key === "home.energy.analyze") return Promise.resolve(ok(input, { period: { startDate: value.startDate, endDate: value.endDate }, consumptionKwh: 184.2, estimatedCost: 55.26, currency: value.currency ?? "EUR" }));
  if (key === "wellness.activity.read") return Promise.resolve(ok(input, { period: { startDate: value.startDate, endDate: value.endDate }, steps: 42110, sleepHours: 48.5, medicalData: false }));
  if (key === "wellness.plan.prepare") return Promise.resolve(ok(input, { planId: reference("wellness", input), goal: value.goal, startDate: value.startDate, status: "prepared", diagnostic: false, medicalAdvice: false }));
  return Promise.resolve({ status: "blocked", toolRunId: toolRunId(input), reason: "Sandbox provider does not support this operation.", code: "adapter_not_implemented", userMessage: "This sandbox operation is not implemented.", retryable: false });
}

export const lifeSandboxProvider: ProviderAdapter = {
  providerId: "life-sandbox", label: "Life Services Sandbox", kind: "native", toolName: "life.sandbox",
  capabilities: [...catalogProvider.capabilities], actions: ["search", "quote", "reserve", "prepare_action", "execute_action", "status", "sync_status", "cancel"],
  requiresConnectedAccount: false, credentialType: "none", authType: "none", riskLevel: "high",
  description: "Deterministic non-production provider for every advertised life-services sandbox capability. No external system is contacted.", supportsHealthCheck: true,
  canHandle(input) { return (!input.preferredProviderId || input.preferredProviderId === this.providerId) && this.capabilities.includes(input.capabilityKey) && this.actions.includes(input.action); }, execute,
  async healthCheck() { return { state: "healthy", message: "All catalogued life sandbox capabilities are available without external side effects.", checkedAt: new Date().toISOString() }; }
};
