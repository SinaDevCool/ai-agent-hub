import { Router } from "express";
import { badRequest } from "../errors/httpError.js";
import { getLifeCapability, lifeCapabilities, lifeProviders, routeLifeProviders, type ExecutionLevel } from "../services/lifePlatformCatalog.js";
import { createLifeActionPlan, isLifeTransactionState, listLifeTransactions, persistLifeActionPlan, serializeLifeTransaction, transitionPersistedLifeTransaction, validateLifeActionPlan } from "../services/lifeTransactionService.js";
import { listLifeProviderReadiness } from "../services/lifeProviderReadinessService.js";
import { bookSandboxFlight, bookSandboxHotel, cancelSandboxFlight, cancelSandboxHotel, getSandboxItinerary, quoteSandboxCancellation, searchSandboxFlights, searchSandboxGroundTransport, searchSandboxHotels, syncSandboxBookingToCalendar } from "../services/travelSandboxService.js";
import { cancelSandboxPayment, getFinanceSummary, simulateSandboxPayment, syncFinanceSandbox } from "../services/financeSandboxService.js";
import { bookSandboxAppointment, cancelSandboxAppointment, listAppointments, rescheduleSandboxAppointment, searchSandboxAppointments, syncAppointmentToCalendar } from "../services/appointmentSandboxService.js";
import { cancelSandboxOrder, deleteShoppingList, listShoppingLists, orderSandboxProduct, prepareSandboxCheckout, saveShoppingList, searchSandboxProducts } from "../services/shoppingSandboxService.js";
import { bookSandboxHouseholdService, cancelSandboxHouseholdService, quoteSandboxHouseholdService, searchSandboxHouseholdProviders } from "../services/householdSandboxService.js";
import { cancelSandboxRestaurant, reserveSandboxRestaurant, searchSandboxEvents, searchSandboxRestaurants } from "../services/leisureSandboxService.js";
import { analyzeSandboxEnergy, controlSandboxHomeDevice, listSandboxHomeDevices } from "../services/smartHomeSandboxService.js";
import { prepareSandboxWellnessPlan, readSandboxWellnessActivity } from "../services/wellnessSandboxService.js";

const executionLevels = new Set<ExecutionLevel>(["discover", "compare", "prepare", "redirect", "transact", "manage"]);

export const lifePlatformRoutes = Router();

lifePlatformRoutes.post("/finance/sandbox/sync", async (req, res) => { res.json({ summary: await syncFinanceSandbox(req.userId!) }); });
lifePlatformRoutes.get("/finance/summary", async (req, res) => { res.json({ summary: await getFinanceSummary(req.userId!) }); });
lifePlatformRoutes.post("/finance/sandbox/payment", async (req, res) => { res.status(201).json({ transaction: await simulateSandboxPayment({ userId: req.userId!, payee: req.body?.payee, amount: req.body?.amount, currency: req.body?.currency, confirmed: req.body?.confirmed, idempotencyKey: req.body?.idempotencyKey }) }); });
lifePlatformRoutes.post("/finance/sandbox/payment/:id/cancel", async (req, res) => { res.json({ transaction: await cancelSandboxPayment({ userId: req.userId!, id: req.params.id, confirmed: req.body?.confirmed }) }); });

lifePlatformRoutes.get("/appointments", async (req, res) => { res.json({ appointments: await listAppointments(req.userId!) }); });
lifePlatformRoutes.post("/appointments/sandbox/search", (req, res) => { res.json({ slots: searchSandboxAppointments(req.body ?? {}), sandbox: true }); });
lifePlatformRoutes.post("/appointments/sandbox/book", async (req, res) => { res.status(201).json({ appointment: await bookSandboxAppointment({ userId: req.userId!, slot: req.body?.slot, confirmed: req.body?.confirmed, idempotencyKey: req.body?.idempotencyKey }) }); });
lifePlatformRoutes.post("/appointments/sandbox/:id/reschedule", async (req, res) => { res.json({ appointment: await rescheduleSandboxAppointment({ userId: req.userId!, id: req.params.id, slot: req.body?.slot, confirmed: req.body?.confirmed }) }); });
lifePlatformRoutes.post("/appointments/sandbox/:id/cancel", async (req, res) => { res.json({ appointment: await cancelSandboxAppointment({ userId: req.userId!, id: req.params.id, confirmed: req.body?.confirmed }) }); });
lifePlatformRoutes.post("/appointments/sandbox/:id/calendar", async (req, res) => { const result = await syncAppointmentToCalendar({ userId: req.userId!, id: req.params.id }); res.status(result.blocked ? 409 : 200).json(result); });
lifePlatformRoutes.post("/shopping/sandbox/search", (req, res) => { res.json({ offers: searchSandboxProducts(req.body ?? {}), sandbox: true }); });
lifePlatformRoutes.post("/shopping/sandbox/checkout", (req, res) => { res.json({ checkout: prepareSandboxCheckout({ offer: req.body?.offer, quantity: req.body?.quantity }) }); });
lifePlatformRoutes.post("/shopping/sandbox/order", async (req, res) => { res.status(201).json({ transaction: await orderSandboxProduct({ userId: req.userId!, offer: req.body?.offer, quantity: req.body?.quantity, confirmed: req.body?.confirmed, idempotencyKey: req.body?.idempotencyKey }) }); });
lifePlatformRoutes.post("/shopping/sandbox/:id/cancel", async (req, res) => { res.json({ transaction: await cancelSandboxOrder({ userId: req.userId!, transactionId: req.params.id, confirmed: req.body?.confirmed }) }); });
lifePlatformRoutes.get("/shopping/lists", async (req, res) => { res.json({ lists: await listShoppingLists(req.userId!) }); });
lifePlatformRoutes.put("/shopping/lists", async (req, res) => { res.json({ list: await saveShoppingList({ userId: req.userId!, name: req.body?.name, items: req.body?.items }) }); });
lifePlatformRoutes.delete("/shopping/lists/:id", async (req, res) => { res.json(await deleteShoppingList({ userId: req.userId!, id: req.params.id })); });
lifePlatformRoutes.post("/household/sandbox/search", (req, res) => { res.json({ providers: searchSandboxHouseholdProviders(req.body ?? {}), sandbox: true }); });
lifePlatformRoutes.post("/household/sandbox/quote", (req, res) => { res.json({ quote: quoteSandboxHouseholdService({ provider: req.body?.provider, description: req.body?.description, currency: req.body?.currency }) }); });
lifePlatformRoutes.post("/household/sandbox/book", async (req, res) => { res.status(201).json({ transaction: await bookSandboxHouseholdService({ userId: req.userId!, quote: req.body?.quote, confirmed: req.body?.confirmed, idempotencyKey: req.body?.idempotencyKey }) }); });
lifePlatformRoutes.post("/household/sandbox/:id/cancel", async (req, res) => { res.json({ transaction: await cancelSandboxHouseholdService({ userId: req.userId!, transactionId: req.params.id, confirmed: req.body?.confirmed }) }); });
lifePlatformRoutes.post("/leisure/sandbox/restaurants/search", (req, res) => { res.json({ slots: searchSandboxRestaurants(req.body ?? {}), sandbox: true }); });
lifePlatformRoutes.post("/leisure/sandbox/restaurants/reserve", async (req, res) => { res.status(201).json({ transaction: await reserveSandboxRestaurant({ userId: req.userId!, slot: req.body?.slot, confirmed: req.body?.confirmed, idempotencyKey: req.body?.idempotencyKey }) }); });
lifePlatformRoutes.post("/leisure/sandbox/restaurants/:id/cancel", async (req, res) => { res.json({ transaction: await cancelSandboxRestaurant({ userId: req.userId!, id: req.params.id, confirmed: req.body?.confirmed }) }); });
lifePlatformRoutes.post("/leisure/sandbox/events/search", (req, res) => { res.json({ events: searchSandboxEvents(req.body ?? {}), sandbox: true }); });
lifePlatformRoutes.get("/home/sandbox/devices", async (req, res) => { res.json({ devices: await listSandboxHomeDevices(req.userId!), sandbox: true }); });
lifePlatformRoutes.post("/home/sandbox/control", async (req, res) => { res.status(201).json({ transaction: await controlSandboxHomeDevice({ userId: req.userId!, entityId: req.body?.entityId, command: req.body?.command, confirmed: req.body?.confirmed, idempotencyKey: req.body?.idempotencyKey }) }); });
lifePlatformRoutes.post("/home/sandbox/energy", (req, res) => { res.json({ analysis: analyzeSandboxEnergy(req.body ?? {}) }); });
lifePlatformRoutes.post("/wellness/sandbox/activity", (req, res) => { res.json({ activity: readSandboxWellnessActivity(req.body ?? {}) }); });
lifePlatformRoutes.post("/wellness/sandbox/plan", async (req, res) => { res.status(201).json({ transaction: await prepareSandboxWellnessPlan({ userId: req.userId!, goal: req.body?.goal, startDate: req.body?.startDate, idempotencyKey: req.body?.idempotencyKey }) }); });

lifePlatformRoutes.post("/travel/sandbox/search", (req, res) => {
  res.json({ offers: searchSandboxFlights(req.body ?? {}), sandbox: true });
});
lifePlatformRoutes.post("/travel/sandbox/hotels/search", (req, res) => { res.json({ offers: searchSandboxHotels(req.body ?? {}), sandbox: true }); });
lifePlatformRoutes.post("/travel/sandbox/hotels/book", async (req, res) => { res.status(201).json({ transaction: await bookSandboxHotel({ userId: req.userId!, offer: req.body?.offer, confirmed: req.body?.confirmed, idempotencyKey: req.body?.idempotencyKey }) }); });
lifePlatformRoutes.post("/travel/sandbox/hotels/:id/cancel", async (req, res) => { res.json({ transaction: await cancelSandboxHotel({ userId: req.userId!, transactionId: req.params.id, confirmed: req.body?.confirmed }) }); });
lifePlatformRoutes.post("/travel/sandbox/ground/search", (req, res) => { res.json({ offers: searchSandboxGroundTransport(req.body ?? {}), sandbox: true }); });
lifePlatformRoutes.get("/travel/sandbox/itinerary", async (req, res) => { res.json({ itinerary: await getSandboxItinerary(req.userId!) }); });

lifePlatformRoutes.post("/travel/sandbox/book", async (req, res) => {
  res.status(201).json({ transaction: await bookSandboxFlight({ userId: req.userId!, offer: req.body?.offer, passengerNames: req.body?.passengerNames, confirmed: req.body?.confirmed, idempotencyKey: req.body?.idempotencyKey }) });
});

lifePlatformRoutes.post("/travel/sandbox/:id/cancellation-quote", async (req, res) => {
  res.json({ quote: await quoteSandboxCancellation({ userId: req.userId!, transactionId: req.params.id }) });
});

lifePlatformRoutes.post("/travel/sandbox/:id/cancel", async (req, res) => {
  res.json({ transaction: await cancelSandboxFlight({ userId: req.userId!, transactionId: req.params.id, confirmed: req.body?.confirmed }) });
});

lifePlatformRoutes.post("/travel/sandbox/:id/calendar", async (req, res) => {
  const result = await syncSandboxBookingToCalendar({ userId: req.userId!, transactionId: req.params.id, timeZone: typeof req.body?.timeZone === "string" ? req.body.timeZone : undefined });
  res.status(result.blocked ? 409 : 200).json(result);
});

lifePlatformRoutes.get("/catalog", async (req, res) => {
  res.json({ capabilities: lifeCapabilities, providers: lifeProviders, readiness: await listLifeProviderReadiness(req.userId!) });
});

lifePlatformRoutes.get("/capabilities/:key/providers", (req, res) => {
  const capability = getLifeCapability(req.params.key);
  if (!capability) throw badRequest("Unknown life capability.");
  const requestedLevel = typeof req.query.level === "string" ? req.query.level as ExecutionLevel : undefined;
  if (requestedLevel && !executionLevels.has(requestedLevel)) throw badRequest("Unknown execution level.");
  res.json({
    capability,
    providers: routeLifeProviders({
      capabilityKey: capability.key,
      region: typeof req.query.region === "string" ? req.query.region : undefined,
      requiredLevel: requestedLevel
    })
  });
});

lifePlatformRoutes.get("/transactions", async (req, res) => {
  res.json({ transactions: await listLifeTransactions(req.userId!) });
});

lifePlatformRoutes.post("/transactions", async (req, res) => {
  const level = req.body?.executionLevel as ExecutionLevel;
  if (!executionLevels.has(level)) throw badRequest("Unknown execution level.");
  const plan = validateLifeActionPlan(createLifeActionPlan({
    capabilityKey: String(req.body?.capabilityKey ?? ""),
    executionLevel: level,
    region: typeof req.body?.region === "string" ? req.body.region : undefined,
    providerId: typeof req.body?.providerId === "string" ? req.body.providerId : undefined,
    values: req.body?.input && typeof req.body.input === "object" ? req.body.input : {},
    idempotencyKey: typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : undefined
  }));
  res.status(201).json({ transaction: serializeLifeTransaction(await persistLifeActionPlan(req.userId!, plan)) });
});

lifePlatformRoutes.post("/transactions/:id/transition", async (req, res) => {
  const next = String(req.body?.state ?? "");
  if (!isLifeTransactionState(next)) throw badRequest("Unknown transaction state.");
  if (next !== "cancelled") throw badRequest("Provider and approval state transitions cannot be set directly by the client.");
  res.json({ transaction: await transitionPersistedLifeTransaction({
    userId: req.userId!,
    id: req.params.id,
    next,
    result: req.body?.result,
    externalReference: req.body?.externalReference,
    failureReason: req.body?.failureReason,
    hitlRequestId: req.body?.hitlRequestId
  }) });
});
