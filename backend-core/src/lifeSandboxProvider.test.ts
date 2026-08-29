import assert from "node:assert/strict";
import test from "node:test";
import { getConnectorCapability } from "./services/connectorCapabilityService.js";
import { lifeSandboxProvider } from "./services/providers/lifeSandboxProvider.js";
import { resolveConnectorProvider } from "./services/connectorProviderRegistryService.js";

function capability(key: string) {
  const value = getConnectorCapability(key);
  assert.ok(value);
  return value;
}

test("travel sandbox searches and books idempotently", async () => {
  const searched = await lifeSandboxProvider.execute({ userId: "u", agentId: "a", capability: capability("travel.flight.search"), action: "search", input: { origin: "BER", destination: "LHR", departureDate: "2030-01-01", passengers: 1 }, attempt: 1 });
  assert.equal(searched.status, "ok");
  if (searched.status !== "ok") return;
  assert.equal((searched.result?.offers as unknown[]).length, 2);

  const bookingInput = { userId: "u", agentId: "a", capability: capability("travel.flight.book"), action: "reserve" as const, input: { selectedOfferId: "sandbox-flight-flex", maxApprovedTotal: 249, currency: "EUR", approvalRequestId: "approval-1" }, attempt: 1, idempotencyKey: "booking-1" };
  const first = await lifeSandboxProvider.execute(bookingInput);
  const replay = await lifeSandboxProvider.execute(bookingInput);
  assert.equal(first.status, "ok");
  assert.equal(replay.status, "ok");
  if (first.status === "ok" && replay.status === "ok") assert.equal(first.result?.orderId, replay.result?.orderId);
});

test("travel sandbox refuses booking without explicit approval reference", async () => {
  const result = await lifeSandboxProvider.execute({ userId: "u", agentId: "a", capability: capability("travel.flight.book"), action: "reserve", input: { selectedOfferId: "sandbox-flight-flex", maxApprovedTotal: 249, currency: "EUR" }, attempt: 1 });
  assert.equal(result.status, "blocked");
  if (result.status === "blocked") assert.equal(result.code, "invalid_input");
});

test("registry resolves the sandbox through a life capability alias", () => {
  assert.equal(resolveConnectorProvider({ capabilityKey: "travel.flight.search", preferredProviderId: "life-sandbox" })?.providerId, "life-sandbox");
});

test("native sandbox adapters match every capability advertised by their catalog entries", async () => {
  const { lifeProviders } = await import("./services/lifePlatformCatalog.js");
  const { financeSandboxProvider } = await import("./services/providers/financeSandboxProvider.js");
  assert.deepEqual([...lifeSandboxProvider.capabilities].sort(), [...lifeProviders.find((item) => item.id === "life-sandbox")!.capabilities].sort());
  assert.deepEqual([...financeSandboxProvider.capabilities].sort(), [...lifeProviders.find((item) => item.id === "finance-sandbox")!.capabilities].sort());
  assert.equal(resolveConnectorProvider({ capabilityKey: "finance.payment.create", preferredProviderId: "finance-sandbox" })?.providerId, "finance-sandbox");
});

test("every life sandbox capability resolves and has an implemented execution branch", async () => {
  for (const capabilityKey of lifeSandboxProvider.capabilities) {
    const selected = resolveConnectorProvider({ capabilityKey, preferredProviderId: "life-sandbox" });
    assert.equal(selected?.providerId, "life-sandbox", capabilityKey);
    const resolvedCapability = capability(capabilityKey);
    const result = await lifeSandboxProvider.execute({ userId: "u", agentId: "a", capability: resolvedCapability, action: resolvedCapability.defaultAction, input: {}, attempt: 1 });
    if (result.status === "blocked") assert.notEqual(result.code, "adapter_not_implemented", capabilityKey);
  }
});
