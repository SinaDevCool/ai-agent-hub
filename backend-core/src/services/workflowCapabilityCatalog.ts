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

const capabilityMap = new Map(workflowCapabilities.map((capability) => [capability.key, capability]));

export function listWorkflowCapabilities() {
  return workflowCapabilities;
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
  if (/\b(spending|budget|transaction|transactions|expense|expenses)\b/.test(haystack)) return "finance.review_spending";
  return "general.research";
}
