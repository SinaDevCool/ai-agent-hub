import { apiDelete, apiGet, apiPost, apiPut } from "./client";
import type { Appointment, FinanceSummary, LifeCapability, LifeExecutionLevel, LifeProvider, LifeProviderReadiness, LifeTransaction, LifeTransactionState, SandboxAppointmentSlot, SandboxCancellationQuote, SandboxEnergyAnalysis, SandboxEvent, SandboxFlightOffer, SandboxGroundOffer, SandboxHomeDevice, SandboxHotelOffer, SandboxHouseholdProvider, SandboxHouseholdQuote, SandboxItinerary, SandboxProductOffer, SandboxRestaurantSlot, SandboxWellnessActivity, ShoppingList } from "./types";

export function getLifePlatformCatalog() {
  return apiGet<{ capabilities: LifeCapability[]; providers: LifeProvider[]; readiness: LifeProviderReadiness[] }>("/api/life-platform/catalog");
}
export function getLifeTransactions() {
  return apiGet<{ transactions: LifeTransaction[] }>("/api/life-platform/transactions");
}
export function createLifeTransaction(input: { capabilityKey: string; executionLevel: LifeExecutionLevel; region?: string; providerId?: string; input?: Record<string, unknown>; idempotencyKey?: string }) {
  return apiPost<{ transaction: LifeTransaction }>("/api/life-platform/transactions", input);
}
export function transitionLifeTransaction(id: string, state: LifeTransactionState, values: Record<string, unknown> = {}) {
  return apiPost<{ transaction: LifeTransaction }>(`/api/life-platform/transactions/${id}/transition`, { state, ...values });
}
export function searchSandboxFlights(input: { origin: string; destination: string; departureDate: string; currency?: string }) {
  return apiPost<{ offers: SandboxFlightOffer[]; sandbox: true }>("/api/life-platform/travel/sandbox/search", input);
}
export function bookSandboxFlight(input: { offer: SandboxFlightOffer; passengerNames: string[]; confirmed: true; idempotencyKey: string }) {
  return apiPost<{ transaction: LifeTransaction }>("/api/life-platform/travel/sandbox/book", input);
}
export function quoteSandboxCancellation(id: string) {
  return apiPost<{ quote: SandboxCancellationQuote }>(`/api/life-platform/travel/sandbox/${id}/cancellation-quote`);
}
export function cancelSandboxFlight(id: string) {
  return apiPost<{ transaction: LifeTransaction }>(`/api/life-platform/travel/sandbox/${id}/cancel`, { confirmed: true });
}
export function syncSandboxTravelCalendar(id: string, timeZone?: string) {
  return apiPost<{ transaction: LifeTransaction; calendarEvent: { eventId?: string; eventUrl?: string; eventStatus?: string } | null; replayed: boolean; blocked?: boolean; reason?: string }>(`/api/life-platform/travel/sandbox/${id}/calendar`, { timeZone });
}
export function searchSandboxHotels(input: { destination: string; checkInDate: string; checkOutDate: string; guests: number; rooms: number }) { return apiPost<{ offers: SandboxHotelOffer[]; sandbox: true }>("/api/life-platform/travel/sandbox/hotels/search", input); }
export function bookSandboxHotel(offer: SandboxHotelOffer) { return apiPost<{ transaction: LifeTransaction }>("/api/life-platform/travel/sandbox/hotels/book", { offer, confirmed: true, idempotencyKey: globalThis.crypto.randomUUID() }); }
export function cancelSandboxHotel(id: string) { return apiPost<{ transaction: LifeTransaction }>(`/api/life-platform/travel/sandbox/hotels/${id}/cancel`, { confirmed: true }); }
export function searchSandboxGround(input: { origin: string; destination: string; departureDate: string }) { return apiPost<{ offers: SandboxGroundOffer[]; sandbox: true }>("/api/life-platform/travel/sandbox/ground/search", input); }
export function getSandboxItinerary() { return apiGet<{ itinerary: SandboxItinerary }>("/api/life-platform/travel/sandbox/itinerary"); }
export function syncFinanceSandbox() { return apiPost<{ summary: FinanceSummary }>("/api/life-platform/finance/sandbox/sync"); }
export function getFinanceSummary() { return apiGet<{ summary: FinanceSummary }>("/api/life-platform/finance/summary"); }
export function simulateSandboxPayment(input: { payee: string; amount: number; currency: string }) { return apiPost<{ transaction: LifeTransaction }>("/api/life-platform/finance/sandbox/payment", { ...input, confirmed: true, idempotencyKey: globalThis.crypto.randomUUID() }); }
export function cancelSandboxPayment(id: string) { return apiPost<{ transaction: LifeTransaction }>(`/api/life-platform/finance/sandbox/payment/${id}/cancel`, { confirmed: true }); }
export function getAppointments() { return apiGet<{ appointments: Appointment[] }>("/api/life-platform/appointments"); }
export function searchSandboxAppointments(input: { specialty: string; location: string; date: string; timeZone: string }) { return apiPost<{ slots: SandboxAppointmentSlot[]; sandbox: true }>("/api/life-platform/appointments/sandbox/search", input); }
export function bookSandboxAppointment(input: { slot: SandboxAppointmentSlot; confirmed: true; idempotencyKey: string }) { return apiPost<{ appointment: Appointment }>("/api/life-platform/appointments/sandbox/book", input); }
export function rescheduleSandboxAppointment(id: string, slot: SandboxAppointmentSlot) { return apiPost<{ appointment: Appointment }>(`/api/life-platform/appointments/sandbox/${id}/reschedule`, { slot, confirmed: true }); }
export function cancelSandboxAppointment(id: string) { return apiPost<{ appointment: Appointment }>(`/api/life-platform/appointments/sandbox/${id}/cancel`, { confirmed: true }); }
export function syncSandboxAppointmentCalendar(id: string) { return apiPost<{ appointment: Appointment; calendarEvent: Record<string, unknown> | null; replayed: boolean; blocked?: boolean; reason?: string }>(`/api/life-platform/appointments/sandbox/${id}/calendar`); }
export function searchSandboxProducts(query: string) { return apiPost<{ offers: SandboxProductOffer[]; sandbox: true }>("/api/life-platform/shopping/sandbox/search", { query }); }
export function orderSandboxProduct(offer: SandboxProductOffer, quantity: number) { return apiPost<{ transaction: LifeTransaction }>("/api/life-platform/shopping/sandbox/order", { offer, quantity, confirmed: true, idempotencyKey: globalThis.crypto.randomUUID() }); }
export function cancelSandboxOrder(id: string) { return apiPost<{ transaction: LifeTransaction }>(`/api/life-platform/shopping/sandbox/${id}/cancel`, { confirmed: true }); }
export function getShoppingLists() { return apiGet<{ lists: ShoppingList[] }>("/api/life-platform/shopping/lists"); }
export function saveShoppingList(input: { name: string; items: ShoppingList["items"] }) { return apiPut<{ list: ShoppingList }>("/api/life-platform/shopping/lists", input); }
export function deleteShoppingList(id: string) { return apiDelete<{ deleted: true }>(`/api/life-platform/shopping/lists/${id}`); }
export function searchSandboxHousehold(input: { serviceType: string; location: string; description: string }) { return apiPost<{ providers: SandboxHouseholdProvider[]; sandbox: true }>("/api/life-platform/household/sandbox/search", input); }
export function quoteSandboxHousehold(provider: SandboxHouseholdProvider, description: string) { return apiPost<{ quote: SandboxHouseholdQuote }>("/api/life-platform/household/sandbox/quote", { provider, description }); }
export function bookSandboxHousehold(quote: SandboxHouseholdQuote) { return apiPost<{ transaction: LifeTransaction }>("/api/life-platform/household/sandbox/book", { quote, confirmed: true, idempotencyKey: globalThis.crypto.randomUUID() }); }
export function cancelSandboxHousehold(id: string) { return apiPost<{ transaction: LifeTransaction }>(`/api/life-platform/household/sandbox/${id}/cancel`, { confirmed: true }); }
export function searchSandboxRestaurants(input: { location: string; cuisine: string; dateTime: string; partySize: number }) { return apiPost<{ slots: SandboxRestaurantSlot[]; sandbox: true }>("/api/life-platform/leisure/sandbox/restaurants/search", input); }
export function reserveSandboxRestaurant(slot: SandboxRestaurantSlot) { return apiPost<{ transaction: LifeTransaction }>("/api/life-platform/leisure/sandbox/restaurants/reserve", { slot, confirmed: true, idempotencyKey: globalThis.crypto.randomUUID() }); }
export function cancelSandboxRestaurant(id: string) { return apiPost<{ transaction: LifeTransaction }>(`/api/life-platform/leisure/sandbox/restaurants/${id}/cancel`, { confirmed: true }); }
export function searchSandboxEvents(input: { location: string; startDate: string; endDate: string }) { return apiPost<{ events: SandboxEvent[]; sandbox: true }>("/api/life-platform/leisure/sandbox/events/search", input); }
export function getSandboxHomeDevices() { return apiGet<{ devices: SandboxHomeDevice[]; sandbox: true }>("/api/life-platform/home/sandbox/devices"); }
export function controlSandboxHomeDevice(entityId: string, command: string) { return apiPost<{ transaction: LifeTransaction }>("/api/life-platform/home/sandbox/control", { entityId, command, confirmed: true, idempotencyKey: globalThis.crypto.randomUUID() }); }
export function analyzeSandboxEnergy(input: { startDate: string; endDate: string }) { return apiPost<{ analysis: SandboxEnergyAnalysis }>("/api/life-platform/home/sandbox/energy", input); }
export function readSandboxWellnessActivity(input: { startDate: string; endDate: string }) { return apiPost<{ activity: SandboxWellnessActivity }>("/api/life-platform/wellness/sandbox/activity", input); }
export function prepareSandboxWellnessPlan(input: { goal: string; startDate: string }) { return apiPost<{ transaction: LifeTransaction }>("/api/life-platform/wellness/sandbox/plan", { ...input, idempotencyKey: globalThis.crypto.randomUUID() }); }
