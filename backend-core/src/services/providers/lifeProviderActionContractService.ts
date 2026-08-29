import { getLifeCapability } from "../lifePlatformCatalog.js";
import type { ConnectorAction } from "../connectorCapabilityService.js";
import type { ProviderActionSchema, ProviderRiskLevel } from "./providerAdapterTypes.js";

const t = (description: string) => ({ type: "string" as const, description });
const n = (description: string) => ({ type: "number" as const, description });
const d = (description: string) => ({ type: "date" as const, description });
const approval = { approvalRequestId: t("Approval for this exact external action.") };
type Spec = { required: string[]; fields: ProviderActionSchema["inputSchema"]; prompt: string };

const specs: Record<string, Spec> = {
  "admin.email.read": { required: ["query"], fields: { query: t("Mailbox query.") }, prompt: "Describe the messages to find." },
  "admin.email.draft": { required: ["recipients", "purpose"], fields: { recipients: { type: "array", description: "Recipients." }, purpose: t("Draft purpose.") }, prompt: "Add recipients and purpose." },
  "admin.email.send": { required: ["draftId", "approvalRequestId"], fields: { draftId: t("Saved draft."), ...approval }, prompt: "Approve the exact draft." },
  "admin.calendar.read": { required: ["startDate", "endDate", "timeZone"], fields: { startDate: d("Start."), endDate: d("End."), timeZone: t("IANA zone.") }, prompt: "Add dates and time zone." },
  "admin.calendar.manage": { required: ["operation", "title", "startDate", "approvalRequestId"], fields: { operation: t("create, update, cancel."), title: t("Title."), startDate: d("Start."), ...approval }, prompt: "Add and approve event details." },
  "admin.documents.search": { required: ["query"], fields: { query: t("Document query.") }, prompt: "Describe documents to find." },
  "travel.flight.search": { required: ["origin", "destination", "departureDate", "passengers"], fields: { origin: t("Origin."), destination: t("Destination."), departureDate: d("Departure."), passengers: n("Passengers.") }, prompt: "Add route, date, and passengers." },
  "travel.hotel.search": { required: ["destination", "checkInDate", "checkOutDate", "guests"], fields: { destination: t("Destination."), checkInDate: d("Check in."), checkOutDate: d("Check out."), guests: n("Guests.") }, prompt: "Add destination, dates, and guests." },
  "travel.flight.book": { required: ["selectedOfferId", "maxApprovedTotal", "currency", "approvalRequestId"], fields: { selectedOfferId: t("Fresh offer."), maxApprovedTotal: n("Maximum total."), currency: t("Currency."), ...approval }, prompt: "Select a fresh offer and approve the total." },
  "travel.hotel.book": { required: ["selectedOfferId", "maxApprovedTotal", "currency", "approvalRequestId"], fields: { selectedOfferId: t("Fresh offer."), maxApprovedTotal: n("Maximum total."), currency: t("Currency."), ...approval }, prompt: "Select a fresh offer and approve the total." },
  "travel.ground.search": { required: ["origin", "destination", "departureDate"], fields: { origin: t("Origin."), destination: t("Destination."), departureDate: d("Departure.") }, prompt: "Add ground route and date." },
  "travel.itinerary.manage": { required: ["operation"], fields: { operation: t("Build, read, or synchronize itinerary."), transactionIds: { type: "array", description: "Travel transaction identifiers." } }, prompt: "Choose an itinerary operation." },
  "appointments.provider.search": { required: ["specialty", "location"], fields: { specialty: t("Specialty."), location: t("City or postcode.") }, prompt: "Add specialty and location." },
  "appointments.availability.search": { required: ["providerId", "startDate", "endDate"], fields: { providerId: t("Provider."), startDate: d("Start."), endDate: d("End.") }, prompt: "Choose provider and dates." },
  "appointments.booking.manage": { required: ["operation", "providerId", "slotId"], fields: { operation: t("book, reschedule, cancel."), providerId: t("Provider."), slotId: t("Selected slot."), ...approval }, prompt: "Choose an appointment slot; the exact change must then be approved." },
  "finance.accounts.read": { required: ["connectionId"], fields: { connectionId: t("Bank connection.") }, prompt: "Select a linked bank." },
  "finance.transactions.read": { required: ["connectionId", "startDate", "endDate"], fields: { connectionId: t("Bank connection."), startDate: d("Start."), endDate: d("End.") }, prompt: "Select bank and period." },
  "finance.budget.analyze": { required: ["connectionId", "startDate", "endDate"], fields: { connectionId: t("Bank connection."), startDate: d("Start."), endDate: d("End.") }, prompt: "Select source and period." },
  "finance.payment.create": { required: ["connectionId", "payeeId", "amount", "currency", "approvalRequestId"], fields: { connectionId: t("Payment connection."), payeeId: t("Verified payee."), amount: n("Amount."), currency: t("Currency."), ...approval }, prompt: "Verify and approve payment." },
  "household.provider.search": { required: ["serviceType", "location", "description"], fields: { serviceType: t("Service."), location: t("Area."), description: t("Problem.") }, prompt: "Describe service and location." },
  "household.quote.manage": { required: ["operation", "serviceRequestId"], fields: { operation: t("request, record, compare."), serviceRequestId: t("Request."), ...approval }, prompt: "Choose quote operation." },
  "household.service.book": { required: ["quoteId", "maxApprovedTotal", "approvalRequestId"], fields: { quoteId: t("Quote."), maxApprovedTotal: n("Maximum total."), ...approval }, prompt: "Select and approve quote." },
  "shopping.product.search": { required: ["query", "region"], fields: { query: t("Product."), region: t("Region.") }, prompt: "Add product and region." },
  "shopping.list.manage": { required: ["operation", "items"], fields: { operation: t("List operation."), items: { type: "array", description: "Items." } }, prompt: "Add operation and items." },
  "shopping.order.create": { required: ["cartId", "maxApprovedTotal", "approvalRequestId"], fields: { cartId: t("Cart."), maxApprovedTotal: n("Maximum total."), ...approval }, prompt: "Approve the exact cart." },
  "leisure.restaurant.reserve": { required: ["restaurantId", "dateTime", "partySize", "approvalRequestId"], fields: { restaurantId: t("Restaurant."), dateTime: d("Time."), partySize: n("Party size."), ...approval }, prompt: "Choose and approve reservation." },
  "leisure.event.search": { required: ["location", "startDate", "endDate"], fields: { location: t("Location."), startDate: d("Start."), endDate: d("End.") }, prompt: "Add location and dates." },
  "home.device.read": { required: ["connectionId", "entityIds"], fields: { connectionId: t("Home connection."), entityIds: { type: "array", description: "Allowlisted entities." } }, prompt: "Select approved devices." },
  "home.device.control": { required: ["connectionId", "entityId", "command", "approvalRequestId"], fields: { connectionId: t("Home connection."), entityId: t("Device."), command: t("Command."), ...approval }, prompt: "Choose and approve command." },
  "home.energy.analyze": { required: ["connectionId", "startDate", "endDate"], fields: { connectionId: t("Energy source."), startDate: d("Start."), endDate: d("End.") }, prompt: "Select source and period." },
  "wellness.activity.read": { required: ["connectionId", "startDate", "endDate"], fields: { connectionId: t("Wellness source."), startDate: d("Start."), endDate: d("End.") }, prompt: "Select source and period." },
  "wellness.plan.prepare": { required: ["goal", "startDate"], fields: { goal: t("Non-diagnostic goal."), startDate: d("Start.") }, prompt: "Add goal and start date." }
};

export function lifeProviderActionContract(input: { capabilityKey: string; action: ConnectorAction; riskLevel: ProviderRiskLevel; requiresApproval: boolean }): ProviderActionSchema | null {
  const capability = getLifeCapability(input.capabilityKey);
  const spec = specs[input.capabilityKey];
  if (!capability || !spec) return null;
  return { capabilityKey: capability.key, action: input.action, riskLevel: capability.risk, requiresApproval: capability.approvalRequired || input.requiresApproval, inputSchema: spec.fields, requiredFields: spec.required, outputSchema: { summary: "string", items: "array" }, examples: [], userPrompt: spec.prompt, missingInputMessage: spec.prompt, allowExtraFields: true };
}
