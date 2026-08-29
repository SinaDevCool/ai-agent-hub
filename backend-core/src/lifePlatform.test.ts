import assert from "node:assert/strict";
import test from "node:test";
import { getLifeCapability, lifeCapabilities, lifeProviders, routeLifeProviders } from "./services/lifePlatformCatalog.js";
import { createLifeActionPlan, nextLifeActionState, transitionLifeAction, validateLifeActionPlan } from "./services/lifeTransactionService.js";
import { canonicalProviderActionContract } from "./services/providers/providerActionContractService.js";
import { inferWorkflowCapability, listWorkflowCapabilities } from "./services/workflowCapabilityCatalog.js";

test("routes German hotel search to globally or EU available providers", () => {
  const providers = routeLifeProviders({ capabilityKey: "travel.hotel.search", region: "DE", requiredLevel: "discover" });
  assert.ok(providers.some((item) => item.id === "booking-demand"));
  assert.ok(providers.every((item) => item.capabilities.includes("travel.hotel.search")));
});

test("finance payments are high risk and approval gated", () => {
  const capability = getLifeCapability("finance.payment.create");
  assert.equal(capability?.risk, "high");
  assert.equal(capability?.approvalRequired, true);
  const plan = validateLifeActionPlan(createLifeActionPlan({
    capabilityKey: "finance.payment.create",
    executionLevel: "transact",
    region: "DE",
    values: { amount: 20, currency: "EUR" }
  }));
  assert.equal(nextLifeActionState(plan).state, "awaiting_approval");
});

test("read-only discovery can proceed without approval", () => {
  const plan = validateLifeActionPlan(createLifeActionPlan({
    capabilityKey: "travel.flight.search",
    executionLevel: "discover",
    region: "DE"
  }));
  assert.equal(nextLifeActionState(plan).state, "executing");
});

test("uncertain transactions reconcile instead of retrying blindly", () => {
  let plan = validateLifeActionPlan(createLifeActionPlan({
    capabilityKey: "travel.hotel.book",
    executionLevel: "transact",
    region: "DE"
  }));
  plan = nextLifeActionState(plan);
  plan = transitionLifeAction(plan, "executing");
  plan = transitionLifeAction(plan, "uncertain");
  assert.equal(transitionLifeAction(plan, "reconciliation_required").state, "reconciliation_required");
  assert.throws(() => transitionLifeAction(plan, "executing"));
});

test("life domains expose concrete provider input contracts", () => {
  const appointment = canonicalProviderActionContract({ capabilityKey: "appointments.booking.manage", action: "reserve", riskLevel: "high", requiresApproval: true });
  assert.deepEqual(appointment.requiredFields, ["operation", "providerId", "approvalRequestId"]);
  const payment = canonicalProviderActionContract({ capabilityKey: "finance.payment.create", action: "execute_action", riskLevel: "high", requiresApproval: true });
  assert.ok(payment.requiredFields.includes("payeeId"));
  assert.ok(payment.requiredFields.includes("approvalRequestId"));
  const device = canonicalProviderActionContract({ capabilityKey: "home.device.control", action: "execute_action", riskLevel: "high", requiresApproval: true });
  assert.ok(device.requiredFields.includes("entityId"));
});

test("unified workflow catalog exposes and infers life capabilities", () => {
  const keys = new Set(listWorkflowCapabilities().map((item) => item.key));
  assert.ok(keys.has("appointments.provider.search"));
  assert.ok(keys.has("home.device.control"));
  assert.equal(inferWorkflowCapability({ message: "Find an English speaking dermatologist near Berlin" }), "appointments.provider.search");
  assert.equal(inferWorkflowCapability({ message: "Show my bank transactions for this month" }), "finance.transactions.read");
  assert.equal(inferWorkflowCapability({ message: "Turn off my smart home light" }), "home.device.control");
});

test("every provider catalog capability is canonical and every execution level is supported", () => {
  const capabilities = new Map(lifeCapabilities.map((item) => [item.key, item]));
  for (const provider of lifeProviders) {
    assert.ok(provider.capabilities.length > 0, provider.id);
    for (const capabilityKey of provider.capabilities) {
      const capability = capabilities.get(capabilityKey);
      assert.ok(capability, `${provider.id} declares unknown capability ${capabilityKey}`);
      assert.ok(capability.executionLevels.some((level) => provider.executionLevels.includes(level)), `${provider.id} cannot execute ${capabilityKey} at any shared level`);
    }
  }
});
