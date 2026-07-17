import type { ConnectorAction } from "../connectorCapabilityService.js";
import type { ProviderActionSchema } from "./providerAdapterTypes.js";

type ContractInput = {
  capabilityKey: string;
  action: ConnectorAction;
  riskLevel: ProviderActionSchema["riskLevel"];
  requiresApproval: boolean;
};

function schema(inputSchema: ProviderActionSchema["inputSchema"]) {
  return inputSchema;
}

function baseMessage() {
  return {
    message: { type: "string" as const, description: "Natural-language request from the user." }
  };
}

function searchHotels(input: ContractInput): ProviderActionSchema {
  return {
    capabilityKey: input.capabilityKey,
    action: input.action,
    riskLevel: input.riskLevel,
    requiresApproval: input.requiresApproval,
    inputSchema: schema({
      ...baseMessage(),
      destination: { type: "string", description: "City, neighborhood, hotel area, or destination." },
      checkInDate: { type: "date", description: "Check-in date." },
      checkOutDate: { type: "date", description: "Check-out date." },
      guests: { type: "number", description: "Number of guests." },
      rooms: { type: "number", description: "Number of rooms." },
      minBudget: { type: "number", description: "Minimum total or nightly budget." },
      maxBudget: { type: "number", description: "Maximum total or nightly budget." },
      currency: { type: "string", description: "Preferred currency code." },
      hotelPreferences: { type: "array", description: "Useful hotel preferences such as quiet, central, pool, or family-friendly." },
      cancellationPreference: { type: "string", description: "Refundability or cancellation preference." }
    }),
    requiredFields: ["destination", "checkInDate", "checkOutDate", "guests"],
    outputSchema: { summary: "string", hotels: "array" },
    examples: [{ destination: "Barcelona", checkInDate: "2026-08-12", checkOutDate: "2026-08-16", guests: 2, rooms: 1 }],
    userPrompt: "Tell this provider where and when you want to stay.",
    missingInputMessage: "Add your destination, dates, and number of guests before this agent can search hotels.",
    allowExtraFields: true
  };
}

function searchFlights(input: ContractInput): ProviderActionSchema {
  return {
    capabilityKey: input.capabilityKey,
    action: input.action,
    riskLevel: input.riskLevel,
    requiresApproval: input.requiresApproval,
    inputSchema: schema({
      ...baseMessage(),
      origin: { type: "string", description: "Departure city or airport." },
      destination: { type: "string", description: "Arrival city or airport." },
      departureDate: { type: "date", description: "Departure date." },
      returnDate: { type: "date", description: "Return date for round trips." },
      passengers: { type: "number", description: "Number of passengers." },
      cabin: { type: "string", description: "Cabin class." },
      maxPrice: { type: "number", description: "Maximum approved price." },
      baggageNeeds: { type: "string", description: "Baggage requirements." }
    }),
    requiredFields: ["origin", "destination", "departureDate", "passengers"],
    outputSchema: { summary: "string", flights: "array" },
    examples: [{ origin: "Berlin", destination: "Lisbon", departureDate: "2026-08-12", passengers: 1 }],
    userPrompt: "Tell this provider the route, date, and passenger count.",
    missingInputMessage: "Add the route, departure date, and passengers before this agent can search flights.",
    allowExtraFields: true
  };
}

function searchCars(input: ContractInput): ProviderActionSchema {
  return {
    capabilityKey: input.capabilityKey,
    action: input.action,
    riskLevel: input.riskLevel,
    requiresApproval: input.requiresApproval,
    inputSchema: schema({
      ...baseMessage(),
      pickupLocation: { type: "string", description: "Pickup city, airport, or address." },
      dropoffLocation: { type: "string", description: "Dropoff city, airport, or address." },
      pickupDate: { type: "date", description: "Pickup date." },
      dropoffDate: { type: "date", description: "Dropoff date." },
      driverAge: { type: "number", description: "Driver age." },
      carType: { type: "string", description: "Preferred car type." },
      maxPrice: { type: "number", description: "Maximum approved price." }
    }),
    requiredFields: ["pickupLocation", "pickupDate", "dropoffDate", "driverAge"],
    outputSchema: { summary: "string", cars: "array" },
    examples: [{ pickupLocation: "Lisbon airport", pickupDate: "2026-08-12", dropoffDate: "2026-08-16", driverAge: 35 }],
    userPrompt: "Tell this provider where and when you need the car.",
    missingInputMessage: "Add the pickup location, dates, and driver age before this agent can search car rentals.",
    allowExtraFields: true
  };
}

function holdOrBook(input: ContractInput): ProviderActionSchema {
  return {
    capabilityKey: input.capabilityKey,
    action: input.action,
    riskLevel: "high",
    requiresApproval: true,
    inputSchema: schema({
      selectedOptionId: { type: "string", description: "Selected hotel, flight, car, or offer id." },
      providerId: { type: "string", description: "Provider that owns the selected option." },
      maxApprovedTotal: { type: "number", description: "Maximum total the user approved." },
      currency: { type: "string", description: "Approved currency code." },
      cancellationRuleAcknowledged: { type: "boolean", description: "Whether the user acknowledged the cancellation rule." },
      approvalRequestId: { type: "string", description: "Approval request id for this risky action." }
    }),
    requiredFields: ["selectedOptionId", "maxApprovedTotal", "cancellationRuleAcknowledged"],
    outputSchema: { summary: "string", confirmation: "string" },
    examples: [{ selectedOptionId: "hotel-123", maxApprovedTotal: 900, currency: "EUR", cancellationRuleAcknowledged: true }],
    userPrompt: "Choose the exact option and approve the total before booking.",
    missingInputMessage: "Choose an option and approve the total and cancellation rule before this agent can book.",
    allowExtraFields: true
  };
}

function financeReview(input: ContractInput): ProviderActionSchema {
  return {
    capabilityKey: input.capabilityKey,
    action: input.action,
    riskLevel: input.riskLevel,
    requiresApproval: input.requiresApproval,
    inputSchema: schema({
      ...baseMessage(),
      accountSource: { type: "string", description: "Account, provider, or saved data source to review." },
      startDate: { type: "date", description: "Start date for the review." },
      endDate: { type: "date", description: "End date for the review." },
      categories: { type: "array", description: "Optional spending categories to focus on." },
      goal: { type: "string", description: "What the user wants to learn or improve." }
    }),
    requiredFields: ["accountSource", "startDate", "endDate"],
    outputSchema: { summary: "string", results: "array" },
    examples: [{ accountSource: "main card", startDate: "2026-07-01", endDate: "2026-07-31", goal: "find subscription waste" }],
    userPrompt: "Tell this provider which account and date range to review.",
    missingInputMessage: "Add the account or source and date range before this agent can review spending.",
    allowExtraFields: true
  };
}

function healthNotes(input: ContractInput): ProviderActionSchema {
  return {
    capabilityKey: input.capabilityKey,
    action: input.action,
    riskLevel: input.riskLevel,
    requiresApproval: input.requiresApproval,
    inputSchema: schema({
      ...baseMessage(),
      noteCategory: { type: "string", description: "Health note category to organize." },
      allowedPrivateInfoIds: { type: "array", description: "Saved private info ids the user allowed." },
      task: { type: "string", description: "Requested organization task." },
      urgency: { type: "string", description: "Urgency level." },
      sharePreference: { type: "string", description: "Whether to keep private, summarize, or export." }
    }),
    requiredFields: ["noteCategory", "allowedPrivateInfoIds", "task"],
    outputSchema: { summary: "string", results: "array" },
    examples: [{ noteCategory: "medical history", allowedPrivateInfoIds: ["medical-history"], task: "summarize for appointment" }],
    userPrompt: "Tell this provider which health notes it may use and what to organize.",
    missingInputMessage: "Allow the health info and task before this agent can organize health notes.",
    allowExtraFields: true
  };
}

function generic(input: ContractInput): ProviderActionSchema {
  return {
    capabilityKey: input.capabilityKey,
    action: input.action,
    riskLevel: input.riskLevel,
    requiresApproval: input.requiresApproval,
    inputSchema: schema(baseMessage()),
    requiredFields: ["message"],
    outputSchema: { summary: "string", items: "array" },
    examples: [{ message: "Help me with this task" }],
    userPrompt: "Tell this provider what you need.",
    missingInputMessage: "Add a short request before this agent can use this provider.",
    allowExtraFields: true
  };
}

export function canonicalProviderActionContract(input: ContractInput): ProviderActionSchema {
  if (input.action === "reserve" || input.action === "execute_action" || input.capabilityKey === "travel.hold_or_book") return holdOrBook(input);
  if (input.capabilityKey === "travel.search_hotels") return searchHotels(input);
  if (input.capabilityKey === "travel.search_flights") return searchFlights(input);
  if (input.capabilityKey === "travel.search_cars") return searchCars(input);
  if (input.capabilityKey === "finance.review_spending") return financeReview(input);
  if (input.capabilityKey === "health.organize_notes") return healthNotes(input);
  return generic(input);
}
