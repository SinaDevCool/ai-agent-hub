import { lifeCapabilities } from "./lifePlatformCatalog.js";

export type WorkflowCapability = {
  key: string;
  label: string;
  category: string;
  description: string;
  contract: WorkflowCapabilityContract;
};

export type WorkflowCapabilityContract = {
  receives: Record<string, unknown>;
  returns: Record<string, unknown>;
  requiredFields: string[];
  optionalFields: string[];
  outputKeys: string[];
  tips: string[];
};

export const workflowCapabilities: WorkflowCapability[] = [
  {
    key: "travel.hold_or_book",
    label: "Hold or book travel",
    category: "Travel",
    description: "Hold or book a selected travel option only after explicit approval.",
    contract: {
      receives: {
        capabilityKey: "travel.hold_or_book",
        input: { selectedOptionId: "hotel-123", maxApprovedTotal: 900, cancellationRuleAcknowledged: true },
        context: { approvedOnly: true, source: "ai-agent-hub" }
      },
      returns: {
        summary: "The selected option was requested.",
        confirmation: "Pending provider confirmation."
      },
      requiredFields: ["summary"],
      optionalFields: ["confirmation", "providerReference"],
      outputKeys: ["summary", "confirmation"],
      tips: ["Only run this after user approval.", "Return a clear confirmation or pending state."]
    }
  },
  {
    key: "travel.search_hotels",
    label: "Find hotels",
    category: "Travel",
    description: "Search hotel options using an external workflow.",
    contract: {
      receives: {
        capabilityKey: "travel.search_hotels",
        input: { message: "Find hotels in Lisbon near the center" },
        context: { approvedOnly: true, source: "ai-agent-hub" }
      },
      returns: {
        summary: "I found three stays near the center.",
        hotels: [
          {
            name: "Central Lisbon Stay",
            location: "Baixa",
            price: "$145/night",
            bookingUrl: "https://example.com/hotel"
          }
        ]
      },
      requiredFields: ["summary", "hotels[].name"],
      optionalFields: ["hotels[].location", "hotels[].price", "hotels[].bookingUrl", "hotels[].rating"],
      outputKeys: ["summary", "hotels"],
      tips: ["Return a short summary plus a hotels list.", "Use bookingUrl when you want the user to open a result."]
    }
  },
  {
    key: "health.organize_notes",
    label: "Organize health notes",
    category: "Health",
    description: "Organize health notes using only private info the user approved.",
    contract: {
      receives: {
        capabilityKey: "health.organize_notes",
        input: { noteCategory: "medical history", allowedPrivateInfoIds: ["medical-history"], task: "summarize" },
        context: { approvedOnly: true, source: "ai-agent-hub" }
      },
      returns: {
        summary: "I organized the allowed health notes.",
        results: [
          { title: "Medical history summary", description: "Prepared from allowed notes only." }
        ]
      },
      requiredFields: ["summary"],
      optionalFields: ["results[].title", "results[].description"],
      outputKeys: ["summary", "results"],
      tips: ["Never use health notes unless the allowed ids are present.", "Return a concise summary, not medical advice."]
    }
  },
  {
    key: "travel.search_flights",
    label: "Find flights",
    category: "Travel",
    description: "Search flight options using an external workflow.",
    contract: {
      receives: {
        capabilityKey: "travel.search_flights",
        input: { message: "Find flights from Berlin to Lisbon next Friday" },
        context: { approvedOnly: true, source: "ai-agent-hub" }
      },
      returns: {
        summary: "I found two useful flight options.",
        flights: [
          {
            name: "Direct morning flight",
            airline: "Example Air",
            route: "BER to LIS",
            price: "$220",
            bookingUrl: "https://example.com/flight"
          }
        ]
      },
      requiredFields: ["summary", "flights[].name"],
      optionalFields: ["flights[].airline", "flights[].route", "flights[].price", "flights[].bookingUrl"],
      outputKeys: ["summary", "flights"],
      tips: ["Return flights as a list.", "Use price and route when available so the user can compare quickly."]
    }
  },
  {
    key: "travel.search_cars",
    label: "Find car rentals",
    category: "Travel",
    description: "Search car rental options using an external workflow.",
    contract: {
      receives: {
        capabilityKey: "travel.search_cars",
        input: { message: "Find car rentals at Lisbon airport" },
        context: { approvedOnly: true, source: "ai-agent-hub" }
      },
      returns: {
        summary: "I found compact and midsize rentals.",
        cars: [
          {
            name: "Compact automatic",
            provider: "Example Rentals",
            price: "$38/day",
            bookingUrl: "https://example.com/car"
          }
        ]
      },
      requiredFields: ["summary", "cars[].name"],
      optionalFields: ["cars[].provider", "cars[].price", "cars[].bookingUrl", "cars[].location"],
      outputKeys: ["summary", "cars"],
      tips: ["Return cars as a list.", "Keep fees or pickup limits in the description when useful."]
    }
  },
  {
    key: "travel.plan_trip",
    label: "Plan a trip",
    category: "Travel",
    description: "Compare trip options and produce a practical itinerary.",
    contract: {
      receives: {
        capabilityKey: "travel.plan_trip",
        input: { message: "Plan a three day Lisbon trip" },
        context: { approvedOnly: true, source: "ai-agent-hub" }
      },
      returns: {
        summary: "Here is a practical three day plan.",
        options: [
          {
            title: "Day 1",
            description: "Arrive, check in, and explore Baixa."
          }
        ]
      },
      requiredFields: ["summary"],
      optionalFields: ["options[].title", "options[].description", "options[].url"],
      outputKeys: ["summary", "options"],
      tips: ["Return a plan summary first.", "Use options for day-by-day or choice-based plans."]
    }
  },
  {
    key: "email.follow_up",
    label: "Draft follow-ups",
    category: "Work",
    description: "Prepare follow-up messages or response drafts.",
    contract: {
      receives: {
        capabilityKey: "email.follow_up",
        input: { message: "Draft a polite follow-up about my quote" },
        context: { approvedOnly: true, source: "ai-agent-hub" }
      },
      returns: {
        summary: "I prepared a follow-up draft.",
        results: [
          {
            title: "Follow-up draft",
            description: "Hi, I wanted to follow up on..."
          }
        ]
      },
      requiredFields: ["summary"],
      optionalFields: ["results[].title", "results[].description"],
      outputKeys: ["summary", "results"],
      tips: ["Return draft text in description.", "Do not send email from this workflow unless the user approved a sending action."]
    }
  },
  {
    key: "finance.review_spending",
    label: "Review spending",
    category: "Money",
    description: "Review spending records and summarize patterns.",
    contract: {
      receives: {
        capabilityKey: "finance.review_spending",
        input: { message: "Review my monthly spending" },
        context: { approvedOnly: true, source: "ai-agent-hub" }
      },
      returns: {
        summary: "Dining and subscriptions increased this month.",
        results: [
          {
            title: "Subscriptions",
            price: "$86",
            description: "Up $12 from last month."
          }
        ]
      },
      requiredFields: ["summary"],
      optionalFields: ["results[].title", "results[].price", "results[].description"],
      outputKeys: ["summary", "results"],
      tips: ["Summarize patterns, not financial advice.", "Do not move money or change accounts from this workflow."]
    }
  },
  {
    key: "general.research",
    label: "Research online",
    category: "Daily Tasks",
    description: "Run a general research workflow for tasks that do not need a specialized workflow yet.",
    contract: {
      receives: {
        capabilityKey: "general.research",
        input: { message: "Compare good options for a standing desk" },
        context: { approvedOnly: true, source: "ai-agent-hub" }
      },
      returns: {
        summary: "I found three strong options to compare.",
        results: [
          {
            title: "Option one",
            description: "Good value and widely available.",
            url: "https://example.com/result"
          }
        ]
      },
      requiredFields: ["summary"],
      optionalFields: ["results[].title", "results[].description", "results[].url"],
      outputKeys: ["summary", "results"],
      tips: ["Use results for lists of options.", "Keep the summary short enough to read in a chat card."]
    }
  }
];

const lifeWorkflowCapabilities: WorkflowCapability[] = lifeCapabilities
  .filter((life) => !workflowCapabilities.some((current) => current.key === life.key))
  .map((life) => ({
    key: life.key,
    label: life.label,
    category: life.domain.replace(/_/g, " ").replace(/\b\w/g, (value) => value.toUpperCase()),
    description: life.description,
    contract: {
      receives: {
        capabilityKey: life.key,
        input: { message: `Help me ${life.label.toLowerCase()}` },
        context: { approvedOnly: life.approvalRequired, source: "ai-agent-hub" }
      },
      returns: { summary: "A provider-safe summary.", items: [] },
      requiredFields: ["summary"],
      optionalFields: ["items", "confirmation", "providerReference", "checkoutUrl"],
      outputKeys: ["summary", "items"],
      tips: [
        `Execution levels: ${life.executionLevels.join(", ")}.`,
        life.approvalRequired ? "Do not execute until the matching approval is verified." : "Return normalized provider results."
      ]
    }
  }));

const allWorkflowCapabilities = [...workflowCapabilities, ...lifeWorkflowCapabilities];
const capabilityMap = new Map(allWorkflowCapabilities.map((capability) => [capability.key, capability]));

export function listWorkflowCapabilities() {
  return allWorkflowCapabilities;
}

export function getWorkflowCapability(key: string | undefined | null) {
  return capabilityMap.get(key ?? "");
}

export function normalizeWorkflowCapability(key: string | undefined | null) {
  const normalized = (key ?? "general.research").trim();
  return getWorkflowCapability(normalized) ? normalized : null;
}

export function inferWorkflowCapability(input: Record<string, unknown>) {
  if (typeof input.capabilityKey === "string" && input.capabilityKey.trim()) {
    const explicit = normalizeWorkflowCapability(input.capabilityKey);
    if (explicit) return explicit;
  }

  const haystack = Object.values(input)
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (/\b(hotel|hotels|stay|stays|booking\.com|accommodation|lodging)\b/.test(haystack)) return "travel.search_hotels";
  if (/\b(flight|flights|skyscanner|plane|airline|airport)\b/.test(haystack)) return "travel.search_flights";
  if (/\b(car rental|rent a car|rental car|vehicle rental)\b/.test(haystack)) return "travel.search_cars";
  if (/\b(trip|itinerary|travel plan|vacation|holiday)\b/.test(haystack)) return "travel.plan_trip";
  if (/\b(email|reply|follow up|follow-up|inbox)\b/.test(haystack)) return "email.follow_up";
  if (/\b(?:book|reschedule|cancel)\b[^.?!]{0,100}\bappointment\b|\bappointment\b[^.?!]{0,100}\b(?:book|reschedule|cancel)\b/.test(haystack)) return "appointments.booking.manage";
  if (/\b(appointment slot|appointment availability|available appointment)\b/.test(haystack)) return "appointments.availability.search";
  if (/\b(doctor|dentist|clinic|specialist|medical appointment|health appointment|dermatologist|cardiologist)\b/.test(haystack)) return "appointments.provider.search";
  if (/\b(bank account|account balance|balances)\b/.test(haystack)) return "finance.accounts.read";
  if (/\b(bank transactions|categorize transactions|sync transactions)\b/.test(haystack)) return "finance.transactions.read";
  if (/\b(cash flow|recurring charge|subscription spending|analyze budget)\b/.test(haystack)) return "finance.budget.analyze";
  if (/\b(bank payment|payee|send money)\b/.test(haystack)) return "finance.payment.create";
  if (/\b(spending|budget|transaction|transactions|expense|expenses)\b/.test(haystack)) return "finance.review_spending";
  if (/\b(plumber|electrician|cleaner|handyman|home service|repair provider)\b/.test(haystack)) return "household.provider.search";
  if (/\b(request quote|compare quotes|service quote)\b/.test(haystack)) return "household.quote.manage";
  if (/\b(book (?:the )?(?:plumber|electrician|cleaner|handyman|home service))\b/.test(haystack)) return "household.service.book";
  if (/\b(shopping list|grocery list|add to (?:my )?list)\b/.test(haystack)) return "shopping.list.manage";
  if (/\b(product|products|buying options|compare prices)\b/.test(haystack)) return "shopping.product.search";
  if (/\b(place order|checkout cart|buy cart)\b/.test(haystack)) return "shopping.order.create";
  if (/\b(restaurant|dinner reservation|reserve a table|book a table)\b/.test(haystack)) return "leisure.restaurant.reserve";
  if (/\b(event|concert|festival|theatre|theater|tickets?)\b/.test(haystack)) return "leisure.event.search";
  if (/\b(energy use|energy usage|electricity price|power consumption)\b/.test(haystack)) return "home.energy.analyze";
  if (/\b(turn on|turn off|smart home|device command|set temperature)\b/.test(haystack)) return "home.device.control";
  if (/\b(device status|sensor status|home status)\b/.test(haystack)) return "home.device.read";
  if (/\b(activity|steps|sleep|heart rate|fitness data)\b/.test(haystack)) return "wellness.activity.read";
  if (/\b(wellness plan|fitness goal|sleep goal|activity goal)\b/.test(haystack)) return "wellness.plan.prepare";
  if (/\b(document|documents|drive file|find file)\b/.test(haystack)) return "admin.documents.search";
  return "general.research";
}
