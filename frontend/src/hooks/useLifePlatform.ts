import { useCallback, useState } from "react";
import { analyzeSandboxEnergy, bookSandboxAppointment, bookSandboxFlight, bookSandboxHotel, bookSandboxHousehold, cancelSandboxAppointment, cancelSandboxFlight, cancelSandboxHotel, cancelSandboxHousehold, cancelSandboxOrder, cancelSandboxPayment, cancelSandboxRestaurant, controlSandboxHomeDevice, createLifeTransaction, deleteShoppingList, getAppointments, getFinanceSummary, getLifePlatformCatalog, getLifeTransactions, getSandboxHomeDevices, getSandboxItinerary, getShoppingLists, orderSandboxProduct, prepareSandboxWellnessPlan, quoteSandboxCancellation, quoteSandboxHousehold, readSandboxWellnessActivity, reserveSandboxRestaurant, rescheduleSandboxAppointment, saveShoppingList, searchSandboxAppointments, searchSandboxEvents, searchSandboxFlights, searchSandboxGround, searchSandboxHotels, searchSandboxHousehold, searchSandboxProducts, searchSandboxRestaurants, simulateSandboxPayment, syncFinanceSandbox, syncSandboxAppointmentCalendar, syncSandboxTravelCalendar, transitionLifeTransaction } from "../api/lifePlatform";
import type { Appointment, FinanceSummary, LifeCapability, LifeExecutionLevel, LifeProvider, LifeProviderReadiness, LifeTransaction, LifeTransactionState, SandboxAppointmentSlot, SandboxCancellationQuote, SandboxEnergyAnalysis, SandboxEvent, SandboxFlightOffer, SandboxGroundOffer, SandboxHomeDevice, SandboxHotelOffer, SandboxHouseholdProvider, SandboxHouseholdQuote, SandboxItinerary, SandboxProductOffer, SandboxRestaurantSlot, SandboxWellnessActivity, ShoppingList } from "../api/types";

export function useLifePlatform(input: { formatError: (error: unknown) => string }) {
  const [capabilities, setCapabilities] = useState<LifeCapability[]>([]);
  const [providers, setProviders] = useState<LifeProvider[]>([]);
  const [readiness, setReadiness] = useState<LifeProviderReadiness[]>([]);
  const [transactions, setTransactions] = useState<LifeTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [travelOffers, setTravelOffers] = useState<SandboxFlightOffer[]>([]);
  const [cancellationQuote, setCancellationQuote] = useState<SandboxCancellationQuote | null>(null);
  const [financeSummary, setFinanceSummary] = useState<FinanceSummary | null>(null);
  const [appointmentSlots, setAppointmentSlots] = useState<SandboxAppointmentSlot[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [productOffers, setProductOffers] = useState<SandboxProductOffer[]>([]);
  const [householdProviders, setHouseholdProviders] = useState<SandboxHouseholdProvider[]>([]);
  const [householdQuote, setHouseholdQuote] = useState<SandboxHouseholdQuote | null>(null);
  const [restaurantSlots, setRestaurantSlots] = useState<SandboxRestaurantSlot[]>([]);
  const [events, setEvents] = useState<SandboxEvent[]>([]);
  const [homeDevices, setHomeDevices] = useState<SandboxHomeDevice[]>([]);
  const [energyAnalysis, setEnergyAnalysis] = useState<SandboxEnergyAnalysis | null>(null);
  const [wellnessActivity, setWellnessActivity] = useState<SandboxWellnessActivity | null>(null);
  const [hotelOffers, setHotelOffers] = useState<SandboxHotelOffer[]>([]);
  const [groundOffers, setGroundOffers] = useState<SandboxGroundOffer[]>([]);
  const [itinerary, setItinerary] = useState<SandboxItinerary | null>(null);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);

  const refreshLifePlatform = useCallback(async () => {
    setIsLoading(true); setError("");
    try {
      const [catalog, history, finance, appointmentHistory, home, travelItinerary, lists] = await Promise.all([getLifePlatformCatalog(), getLifeTransactions(), getFinanceSummary(), getAppointments(), getSandboxHomeDevices(), getSandboxItinerary(), getShoppingLists()]);
      setCapabilities(catalog.capabilities); setProviders(catalog.providers); setReadiness(catalog.readiness); setTransactions(history.transactions);
      setFinanceSummary(finance.summary);
      setAppointments(appointmentHistory.appointments);
      setHomeDevices(home.devices);
      setItinerary(travelItinerary.itinerary);
      setShoppingLists(lists.lists);
      return true;
    } catch (value) { setError(input.formatError(value)); return false; }
    finally { setIsLoading(false); }
  }, [input]);

  async function prepareTransaction(values: { capabilityKey: string; executionLevel: LifeExecutionLevel; region?: string; providerId?: string; input?: Record<string, unknown> }) {
    setIsSaving(true); setError("");
    try { const result = await createLifeTransaction(values); await refreshLifePlatform(); return result.transaction; }
    catch (value) { setError(input.formatError(value)); return null; }
    finally { setIsSaving(false); }
  }
  async function transition(id: string, state: LifeTransactionState, values?: Record<string, unknown>) {
    setIsSaving(true); setError("");
    try { const result = await transitionLifeTransaction(id, state, values); await refreshLifePlatform(); return result.transaction; }
    catch (value) { setError(input.formatError(value)); return null; }
    finally { setIsSaving(false); }
  }
  async function searchTravel(inputValues: { origin: string; destination: string; departureDate: string }) {
    setIsSaving(true); setError(""); setCancellationQuote(null);
    try { const result = await searchSandboxFlights(inputValues); setTravelOffers(result.offers); return result.offers; }
    catch (value) { setError(input.formatError(value)); return []; }
    finally { setIsSaving(false); }
  }
  async function bookTravel(offer: SandboxFlightOffer, passengerName: string) {
    setIsSaving(true); setError("");
    try { const result = await bookSandboxFlight({ offer, passengerNames: [passengerName], confirmed: true, idempotencyKey: globalThis.crypto.randomUUID() }); await refreshLifePlatform(); return result.transaction; }
    catch (value) { setError(input.formatError(value)); return null; }
    finally { setIsSaving(false); }
  }
  async function quoteCancellation(id: string) {
    setIsSaving(true); setError("");
    try { const result = await quoteSandboxCancellation(id); setCancellationQuote(result.quote); return result.quote; }
    catch (value) { setError(input.formatError(value)); return null; }
    finally { setIsSaving(false); }
  }
  async function confirmCancellation(id: string) {
    setIsSaving(true); setError("");
    try { const result = await cancelSandboxFlight(id); setCancellationQuote(null); await refreshLifePlatform(); return result.transaction; }
    catch (value) { setError(input.formatError(value)); return null; }
    finally { setIsSaving(false); }
  }
  async function syncTravelCalendar(id: string) {
    setIsSaving(true); setError("");
    try { const result = await syncSandboxTravelCalendar(id, Intl.DateTimeFormat().resolvedOptions().timeZone); if (result.blocked) { setError(result.reason ?? "Connect Google Calendar first."); return null; } await refreshLifePlatform(); return result.calendarEvent; }
    catch (value) { setError(input.formatError(value)); return null; }
    finally { setIsSaving(false); }
  }
  async function syncFinance() {
    setIsSaving(true); setError("");
    try { const result = await syncFinanceSandbox(); setFinanceSummary(result.summary); return result.summary; }
    catch (value) { setError(input.formatError(value)); return null; }
    finally { setIsSaving(false); }
  }
  async function simulatePayment(values: { payee: string; amount: number; currency: string }) {
    setIsSaving(true); setError("");
    try { const result = await simulateSandboxPayment(values); await refreshLifePlatform(); return result.transaction; }
    catch (value) { setError(input.formatError(value)); return null; }
    finally { setIsSaving(false); }
  }
  async function cancelPayment(id: string) {
    setIsSaving(true); setError("");
    try { const result = await cancelSandboxPayment(id); await refreshLifePlatform(); return result.transaction; }
    catch (value) { setError(input.formatError(value)); return null; }
    finally { setIsSaving(false); }
  }
  async function searchAppointments(inputValues: { specialty: string; location: string; date: string }) {
    setIsSaving(true); setError("");
    try { const result = await searchSandboxAppointments({ ...inputValues, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }); setAppointmentSlots(result.slots); return result.slots; }
    catch (value) { setError(input.formatError(value)); return []; }
    finally { setIsSaving(false); }
  }
  async function bookAppointment(slot: SandboxAppointmentSlot) {
    setIsSaving(true); setError("");
    try { const result = await bookSandboxAppointment({ slot, confirmed: true, idempotencyKey: globalThis.crypto.randomUUID() }); await refreshLifePlatform(); return result.appointment; }
    catch (value) { setError(input.formatError(value)); return null; }
    finally { setIsSaving(false); }
  }
  async function rescheduleAppointment(id: string, slot: SandboxAppointmentSlot) {
    setIsSaving(true); setError("");
    try { const result = await rescheduleSandboxAppointment(id, slot); await refreshLifePlatform(); return result.appointment; }
    catch (value) { setError(input.formatError(value)); return null; }
    finally { setIsSaving(false); }
  }
  async function cancelAppointment(id: string) {
    setIsSaving(true); setError("");
    try { const result = await cancelSandboxAppointment(id); await refreshLifePlatform(); return result.appointment; }
    catch (value) { setError(input.formatError(value)); return null; }
    finally { setIsSaving(false); }
  }
  async function syncAppointmentCalendar(id: string) {
    setIsSaving(true); setError("");
    try { const result = await syncSandboxAppointmentCalendar(id); if (result.blocked) { setError(result.reason ?? "Connect Google Calendar first."); return null; } await refreshLifePlatform(); return result.calendarEvent; }
    catch (value) { setError(input.formatError(value)); return null; }
    finally { setIsSaving(false); }
  }
  async function searchProducts(query: string) { setIsSaving(true); setError(""); try { const result = await searchSandboxProducts(query); setProductOffers(result.offers); return result.offers; } catch (value) { setError(input.formatError(value)); return []; } finally { setIsSaving(false); } }
  async function orderProduct(offer: SandboxProductOffer, quantity: number) { setIsSaving(true); setError(""); try { const result = await orderSandboxProduct(offer, quantity); await refreshLifePlatform(); return result.transaction; } catch (value) { setError(input.formatError(value)); return null; } finally { setIsSaving(false); } }
  async function cancelOrder(id: string) { setIsSaving(true); setError(""); try { const result = await cancelSandboxOrder(id); await refreshLifePlatform(); return result.transaction; } catch (value) { setError(input.formatError(value)); return null; } finally { setIsSaving(false); } }
  async function searchHousehold(values: { serviceType: string; location: string; description: string }) { setIsSaving(true); setError(""); setHouseholdQuote(null); try { const result = await searchSandboxHousehold(values); setHouseholdProviders(result.providers); return result.providers; } catch (value) { setError(input.formatError(value)); return []; } finally { setIsSaving(false); } }
  async function quoteHousehold(provider: SandboxHouseholdProvider, description: string) { setIsSaving(true); setError(""); try { const result = await quoteSandboxHousehold(provider, description); setHouseholdQuote(result.quote); return result.quote; } catch (value) { setError(input.formatError(value)); return null; } finally { setIsSaving(false); } }
  async function bookHousehold() { if (!householdQuote) return null; setIsSaving(true); setError(""); try { const result = await bookSandboxHousehold(householdQuote); setHouseholdQuote(null); await refreshLifePlatform(); return result.transaction; } catch (value) { setError(input.formatError(value)); return null; } finally { setIsSaving(false); } }
  async function cancelHousehold(id: string) { setIsSaving(true); setError(""); try { const result = await cancelSandboxHousehold(id); await refreshLifePlatform(); return result.transaction; } catch (value) { setError(input.formatError(value)); return null; } finally { setIsSaving(false); } }
  async function searchRestaurants(values: { location: string; cuisine: string; dateTime: string; partySize: number }) { setIsSaving(true); setError(""); try { const result = await searchSandboxRestaurants(values); setRestaurantSlots(result.slots); return result.slots; } catch (value) { setError(input.formatError(value)); return []; } finally { setIsSaving(false); } }
  async function reserveRestaurant(slot: SandboxRestaurantSlot) { setIsSaving(true); setError(""); try { const result = await reserveSandboxRestaurant(slot); await refreshLifePlatform(); return result.transaction; } catch (value) { setError(input.formatError(value)); return null; } finally { setIsSaving(false); } }
  async function cancelRestaurant(id: string) { setIsSaving(true); setError(""); try { const result = await cancelSandboxRestaurant(id); await refreshLifePlatform(); return result.transaction; } catch (value) { setError(input.formatError(value)); return null; } finally { setIsSaving(false); } }
  async function searchEvents(values: { location: string; startDate: string; endDate: string }) { setIsSaving(true); setError(""); try { const result = await searchSandboxEvents(values); setEvents(result.events); return result.events; } catch (value) { setError(input.formatError(value)); return []; } finally { setIsSaving(false); } }
  async function controlHomeDevice(entityId: string, command: string) { setIsSaving(true); setError(""); try { const result = await controlSandboxHomeDevice(entityId, command); await refreshLifePlatform(); return result.transaction; } catch (value) { setError(input.formatError(value)); return null; } finally { setIsSaving(false); } }
  async function analyzeEnergy(values: { startDate: string; endDate: string }) { setIsSaving(true); setError(""); try { const result = await analyzeSandboxEnergy(values); setEnergyAnalysis(result.analysis); return result.analysis; } catch (value) { setError(input.formatError(value)); return null; } finally { setIsSaving(false); } }
  async function readWellnessActivity(values: { startDate: string; endDate: string }) { setIsSaving(true); setError(""); try { const result = await readSandboxWellnessActivity(values); setWellnessActivity(result.activity); return result.activity; } catch (value) { setError(input.formatError(value)); return null; } finally { setIsSaving(false); } }
  async function prepareWellnessPlan(values: { goal: string; startDate: string }) { setIsSaving(true); setError(""); try { const result = await prepareSandboxWellnessPlan(values); await refreshLifePlatform(); return result.transaction; } catch (value) { setError(input.formatError(value)); return null; } finally { setIsSaving(false); } }
  async function searchHotels(values: { destination: string; checkInDate: string; checkOutDate: string; guests: number; rooms: number }) { setIsSaving(true); setError(""); try { const result = await searchSandboxHotels(values); setHotelOffers(result.offers); return result.offers; } catch (value) { setError(input.formatError(value)); return []; } finally { setIsSaving(false); } }
  async function bookHotel(offer: SandboxHotelOffer) { setIsSaving(true); setError(""); try { const result = await bookSandboxHotel(offer); await refreshLifePlatform(); return result.transaction; } catch (value) { setError(input.formatError(value)); return null; } finally { setIsSaving(false); } }
  async function cancelHotel(id: string) { setIsSaving(true); setError(""); try { const result = await cancelSandboxHotel(id); await refreshLifePlatform(); return result.transaction; } catch (value) { setError(input.formatError(value)); return null; } finally { setIsSaving(false); } }
  async function searchGround(values: { origin: string; destination: string; departureDate: string }) { setIsSaving(true); setError(""); try { const result = await searchSandboxGround(values); setGroundOffers(result.offers); return result.offers; } catch (value) { setError(input.formatError(value)); return []; } finally { setIsSaving(false); } }
  async function saveList(name: string, itemNames: string[]) { setIsSaving(true); setError(""); try { const prior = shoppingLists.find((item) => item.name === name); const items = itemNames.map((itemName, index) => ({ id: prior?.items[index]?.id ?? globalThis.crypto.randomUUID(), name: itemName, quantity: prior?.items[index]?.quantity ?? 1, checked: prior?.items[index]?.checked ?? false })); const result = await saveShoppingList({ name, items }); await refreshLifePlatform(); return result.list; } catch (value) { setError(input.formatError(value)); return null; } finally { setIsSaving(false); } }
  async function removeList(id: string) { setIsSaving(true); setError(""); try { await deleteShoppingList(id); await refreshLifePlatform(); return true; } catch (value) { setError(input.formatError(value)); return false; } finally { setIsSaving(false); } }
  return { capabilities, providers, readiness, transactions, travelOffers, hotelOffers, groundOffers, itinerary, cancellationQuote, financeSummary, appointmentSlots, appointments, productOffers, shoppingLists, householdProviders, householdQuote, restaurantSlots, events, homeDevices, energyAnalysis, wellnessActivity, isLoading, isSaving, error, refreshLifePlatform, prepareTransaction, transition, searchTravel, bookTravel, quoteCancellation, confirmCancellation, syncTravelCalendar, searchHotels, bookHotel, cancelHotel, searchGround, syncFinance, simulatePayment, cancelPayment, searchAppointments, bookAppointment, rescheduleAppointment, cancelAppointment, syncAppointmentCalendar, searchProducts, orderProduct, cancelOrder, saveList, removeList, searchHousehold, quoteHousehold, bookHousehold, cancelHousehold, searchRestaurants, reserveRestaurant, cancelRestaurant, searchEvents, controlHomeDevice, analyzeEnergy, readWellnessActivity, prepareWellnessPlan };
}
