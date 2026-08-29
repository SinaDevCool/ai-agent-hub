import type { ConnectorAction } from "./connectorCapabilityService.js";

export type ExecutionLevel = "discover" | "compare" | "prepare" | "redirect" | "transact" | "manage";
export type DataClass = "standard" | "personal" | "financial" | "health" | "high_risk";

export type LifeCapability = {
  key: string;
  label: string;
  domain: string;
  description: string;
  executionLevels: ExecutionLevel[];
  defaultAction: ConnectorAction;
  risk: "low" | "medium" | "high";
  dataClass: DataClass;
  approvalRequired: boolean;
};

export type LifeProvider = {
  id: string;
  label: string;
  domains: string[];
  capabilities: string[];
  regions: string[];
  executionLevels: ExecutionLevel[];
  auth: "none" | "api_key" | "oauth" | "partner_oauth";
  access: "public" | "developer_account" | "partner_approval" | "regulated_partner" | "local_user";
  officialDocs: string;
  notes: string;
};

const capability = (
  key: string,
  label: string,
  domain: string,
  description: string,
  executionLevels: ExecutionLevel[],
  defaultAction: ConnectorAction,
  risk: LifeCapability["risk"],
  dataClass: DataClass,
  approvalRequired = false
): LifeCapability => ({ key, label, domain, description, executionLevels, defaultAction, risk, dataClass, approvalRequired });

export const lifeCapabilities: LifeCapability[] = [
  capability("admin.email.read", "Read email", "administration", "Search and summarize user-authorized mail.", ["discover", "compare"], "search", "medium", "personal"),
  capability("admin.email.draft", "Draft email", "administration", "Prepare an email without sending it.", ["prepare"], "prepare_action", "medium", "personal"),
  capability("admin.email.send", "Send email", "administration", "Send an explicitly approved email.", ["transact"], "execute_action", "high", "personal", true),
  capability("admin.calendar.read", "Read calendar", "administration", "Find events and free time.", ["discover"], "search", "medium", "personal"),
  capability("admin.calendar.manage", "Manage calendar", "administration", "Create, update, or cancel calendar events.", ["prepare", "transact", "manage"], "execute_action", "high", "personal", true),
  capability("admin.documents.search", "Search documents", "administration", "Search user-authorized cloud documents.", ["discover"], "search", "medium", "personal"),
  capability("travel.flight.search", "Search flights", "travel", "Search and compare live flight offers.", ["discover", "compare"], "search", "low", "personal"),
  capability("travel.flight.book", "Book flights", "travel", "Create an approved flight order.", ["prepare", "transact", "manage"], "reserve", "high", "high_risk", true),
  capability("travel.hotel.search", "Search hotels", "travel", "Search and compare lodging offers.", ["discover", "compare", "redirect"], "search", "low", "personal"),
  capability("travel.hotel.book", "Book hotels", "travel", "Create an approved lodging order.", ["prepare", "transact", "manage"], "reserve", "high", "high_risk", true),
  capability("travel.ground.search", "Search ground transport", "travel", "Search rail, bus, car, and transfer options.", ["discover", "compare", "redirect"], "search", "low", "personal"),
  capability("travel.itinerary.manage", "Manage itinerary", "travel", "Build and synchronize an itinerary.", ["prepare", "manage"], "prepare_action", "medium", "personal"),
  capability("appointments.provider.search", "Find providers", "appointments", "Find suitable healthcare or service providers.", ["discover", "compare", "redirect"], "search", "medium", "health"),
  capability("appointments.availability.search", "Find appointments", "appointments", "Search provider availability.", ["discover", "compare"], "search", "medium", "health"),
  capability("appointments.booking.manage", "Manage appointments", "appointments", "Book, reschedule, or cancel an appointment.", ["prepare", "transact", "manage"], "reserve", "high", "health", true),
  capability("finance.accounts.read", "Read accounts", "finance", "Read linked account identity and balances.", ["discover"], "search", "high", "financial"),
  capability("finance.transactions.read", "Read transactions", "finance", "Synchronize and categorize transactions.", ["discover", "compare"], "search", "high", "financial"),
  capability("finance.budget.analyze", "Analyze budget", "finance", "Summarize spending, cash flow, and recurring costs.", ["discover", "compare", "prepare"], "search", "medium", "financial"),
  capability("finance.payment.create", "Create bank payment", "finance", "Create an explicitly approved bank payment.", ["prepare", "transact", "manage"], "execute_action", "high", "high_risk", true),
  capability("household.provider.search", "Find home services", "household", "Find and compare local household providers.", ["discover", "compare", "redirect"], "search", "low", "personal"),
  capability("household.quote.manage", "Manage service quotes", "household", "Prepare requests and compare provider quotes.", ["prepare", "manage"], "quote", "medium", "personal", true),
  capability("household.service.book", "Book home service", "household", "Book an approved household service.", ["prepare", "transact", "manage"], "reserve", "high", "high_risk", true),
  capability("shopping.product.search", "Search products", "shopping", "Find and compare products.", ["discover", "compare", "redirect"], "search", "low", "standard"),
  capability("shopping.list.manage", "Manage shopping lists", "shopping", "Create and update shopping lists.", ["prepare", "manage", "redirect"], "prepare_action", "medium", "personal"),
  capability("shopping.order.create", "Create order", "shopping", "Create an explicitly approved retail order.", ["prepare", "transact", "manage"], "execute_action", "high", "high_risk", true),
  capability("leisure.restaurant.reserve", "Reserve restaurant", "leisure", "Find availability and reserve a table.", ["discover", "compare", "prepare", "transact", "manage"], "reserve", "high", "personal", true),
  capability("leisure.event.search", "Find events", "leisure", "Search events and ticket links.", ["discover", "compare", "redirect"], "search", "low", "standard"),
  capability("home.device.read", "Read smart home", "smart_home", "Read approved device and sensor state.", ["discover"], "status", "medium", "personal"),
  capability("home.device.control", "Control smart home", "smart_home", "Execute an approved device command or routine.", ["prepare", "transact", "manage"], "execute_action", "high", "high_risk", true),
  capability("home.energy.analyze", "Analyze home energy", "smart_home", "Analyze usage, production, and energy prices.", ["discover", "compare", "prepare"], "search", "medium", "personal"),
  capability("wellness.activity.read", "Read wellness activity", "wellness", "Read user-authorized activity, sleep, and fitness data.", ["discover", "compare"], "search", "high", "health"),
  capability("wellness.plan.prepare", "Prepare wellness plan", "wellness", "Prepare non-diagnostic goals and reminders.", ["prepare", "manage"], "prepare_action", "medium", "health")
];

const provider = (value: LifeProvider) => value;

export const lifeProviders: LifeProvider[] = [
  provider({ id: "life-sandbox", label: "Life Services Sandbox", domains: ["travel", "appointments", "shopping", "household", "leisure", "smart_home", "wellness"], capabilities: ["travel.flight.search", "travel.flight.book", "travel.hotel.search", "travel.hotel.book", "travel.ground.search", "travel.itinerary.manage", "appointments.provider.search", "appointments.availability.search", "appointments.booking.manage", "shopping.product.search", "shopping.order.create", "household.provider.search", "household.quote.manage", "household.service.book", "leisure.restaurant.reserve", "leisure.event.search", "home.device.read", "home.device.control", "home.energy.analyze", "wellness.activity.read", "wellness.plan.prepare"], regions: ["GLOBAL"], executionLevels: ["discover", "compare", "prepare", "transact", "manage"], auth: "none", access: "local_user", officialDocs: "/docs/life-platform.md", notes: "Deterministic non-production provider. It never creates a real reservation, appointment, retail order, home-service booking, ticket purchase, physical device command, medical action, or charge." }),
  provider({ id: "finance-sandbox", label: "Finance Sandbox", domains: ["finance"], capabilities: ["finance.accounts.read", "finance.transactions.read", "finance.budget.analyze", "finance.payment.create"], regions: ["GLOBAL"], executionLevels: ["discover", "compare", "prepare", "transact", "manage"], auth: "none", access: "local_user", officialDocs: "/docs/life-platform.md", notes: "Deterministic sample finance data and payment simulations. It cannot move money or contact a bank." }),
  provider({ id: "nylas", label: "Nylas", domains: ["administration"], capabilities: ["admin.email.read", "admin.email.draft", "admin.email.send", "admin.calendar.read", "admin.calendar.manage"], regions: ["EU", "US", "GLOBAL"], executionLevels: ["discover", "prepare", "transact", "manage"], auth: "oauth", access: "developer_account", officialDocs: "https://developer.nylas.com/", notes: "Unified email, contacts, and calendar provider." }),
  provider({ id: "google-workspace", label: "Google Workspace", domains: ["administration"], capabilities: ["admin.email.read", "admin.email.draft", "admin.email.send", "admin.calendar.read", "admin.calendar.manage", "admin.documents.search"], regions: ["GLOBAL"], executionLevels: ["discover", "prepare", "transact", "manage"], auth: "oauth", access: "developer_account", officialDocs: "https://developers.google.com/workspace", notes: "Direct Gmail, Calendar, and Drive integration." }),
  provider({ id: "microsoft-graph", label: "Microsoft Graph", domains: ["administration"], capabilities: ["admin.email.read", "admin.email.draft", "admin.email.send", "admin.calendar.read", "admin.calendar.manage", "admin.documents.search"], regions: ["GLOBAL"], executionLevels: ["discover", "prepare", "transact", "manage"], auth: "oauth", access: "developer_account", officialDocs: "https://learn.microsoft.com/graph/overview", notes: "Microsoft 365 email, calendar, contacts, and OneDrive." }),
  provider({ id: "cal-com", label: "Cal.com", domains: ["administration", "appointments"], capabilities: ["admin.calendar.manage", "appointments.availability.search", "appointments.booking.manage"], regions: ["GLOBAL"], executionLevels: ["discover", "prepare", "transact", "manage"], auth: "oauth", access: "developer_account", officialDocs: "https://cal.com/docs/api-reference/v2/introduction", notes: "Scheduling and managed-user booking APIs." }),
  provider({ id: "amadeus", label: "Amadeus", domains: ["travel"], capabilities: ["travel.flight.search", "travel.hotel.search"], regions: ["GLOBAL"], executionLevels: ["discover", "compare"], auth: "api_key", access: "partner_approval", officialDocs: "https://developers.amadeus.com/self-service/apis-docs", notes: "Search-only adapter. Native flight ordering, hotel booking, card handling, ticket issuance, and hosted checkout are not enabled." }),
  provider({ id: "duffel", label: "Duffel", domains: ["travel"], capabilities: ["travel.flight.search", "travel.flight.book"], regions: ["GLOBAL"], executionLevels: ["discover", "compare", "prepare", "transact", "manage"], auth: "api_key", access: "partner_approval", officialDocs: "https://duffel.com/docs/api", notes: "Flight offers, orders, payment, and supported order management." }),
  provider({ id: "booking-demand", label: "Booking.com Demand", domains: ["travel"], capabilities: ["travel.hotel.search", "travel.hotel.book"], regions: ["GLOBAL"], executionLevels: ["discover", "compare", "redirect", "prepare", "transact", "manage"], auth: "partner_oauth", access: "partner_approval", officialDocs: "https://developers.booking.com/demand/docs", notes: "Native ordering depends on approved integration level." }),
  provider({ id: "expedia-rapid", label: "Expedia Rapid", domains: ["travel"], capabilities: ["travel.hotel.search", "travel.hotel.book"], regions: ["GLOBAL"], executionLevels: ["discover", "compare", "prepare", "transact", "manage"], auth: "api_key", access: "partner_approval", officialDocs: "https://developers.expediagroup.com/docs/products/rapid", notes: "Partner lodging shopping and booking." }),
  provider({ id: "omio", label: "Omio", domains: ["travel"], capabilities: ["travel.ground.search"], regions: ["EU"], executionLevels: ["discover", "compare", "redirect", "transact"], auth: "partner_oauth", access: "partner_approval", officialDocs: "https://www.omio.com/corporate/omio-b2b/", notes: "Meta-search, white-label, and commercial booking options." }),
  provider({ id: "deutsche-bahn", label: "Deutsche Bahn", domains: ["travel"], capabilities: ["travel.ground.search"], regions: ["DE", "EU"], executionLevels: ["discover", "compare", "redirect"], auth: "api_key", access: "developer_account", officialDocs: "https://developer-docs.deutschebahn.com/doku/apis", notes: "Timetables, stations, journeys, and disruption data." }),
  provider({ id: "zocdoc", label: "Zocdoc", domains: ["appointments"], capabilities: ["appointments.provider.search", "appointments.availability.search", "appointments.booking.manage"], regions: ["US"], executionLevels: ["discover", "compare", "prepare", "transact", "manage"], auth: "partner_oauth", access: "partner_approval", officialDocs: "https://api-docs.zocdoc.com/guides", notes: "Provider search and patient appointment lifecycle." }),
  provider({ id: "fhir", label: "FHIR Provider", domains: ["appointments"], capabilities: ["appointments.provider.search", "appointments.availability.search", "appointments.booking.manage"], regions: ["GLOBAL"], executionLevels: ["discover", "prepare", "transact", "manage"], auth: "oauth", access: "partner_approval", officialDocs: "https://hl7.org/fhir/R4/appointment.html", notes: "Standard adapter; availability depends on each healthcare organization." }),
  provider({ id: "nhs-e-referral", label: "NHS e-Referral", domains: ["appointments"], capabilities: ["appointments.provider.search", "appointments.booking.manage"], regions: ["GB"], executionLevels: ["discover", "prepare", "transact", "manage"], auth: "partner_oauth", access: "regulated_partner", officialDocs: "https://digital.nhs.uk/services/e-referral-service/api", notes: "For approved healthcare organizations and suppliers." }),
  provider({ id: "truelayer", label: "TrueLayer", domains: ["finance"], capabilities: ["finance.accounts.read", "finance.transactions.read", "finance.payment.create"], regions: ["EU", "GB"], executionLevels: ["discover", "compare", "prepare", "transact", "manage"], auth: "partner_oauth", access: "regulated_partner", officialDocs: "https://docs.truelayer.com/", notes: "Open-banking data and payments subject to market and onboarding." }),
  provider({ id: "tink", label: "Tink", domains: ["finance"], capabilities: ["finance.accounts.read", "finance.transactions.read", "finance.budget.analyze", "finance.payment.create"], regions: ["EU"], executionLevels: ["discover", "compare", "prepare", "transact"], auth: "partner_oauth", access: "regulated_partner", officialDocs: "https://docs.tink.com/api", notes: "European aggregation, enrichment, finance management, and payments." }),
  provider({ id: "plaid", label: "Plaid", domains: ["finance"], capabilities: ["finance.accounts.read", "finance.transactions.read", "finance.budget.analyze"], regions: ["US", "CA", "GB", "EU"], executionLevels: ["discover", "compare", "prepare"], auth: "partner_oauth", access: "developer_account", officialDocs: "https://plaid.com/docs/api/", notes: "Coverage varies by product, institution, and country." }),
  provider({ id: "google-places", label: "Google Places", domains: ["household", "appointments", "leisure"], capabilities: ["household.provider.search", "appointments.provider.search", "leisure.restaurant.reserve"], regions: ["GLOBAL"], executionLevels: ["discover", "compare", "redirect"], auth: "api_key", access: "developer_account", officialDocs: "https://developers.google.com/maps/documentation/places/web-service", notes: "Discovery and provider links; not universal booking." }),
  provider({ id: "yelp", label: "Yelp Places", domains: ["household", "leisure"], capabilities: ["household.provider.search", "leisure.restaurant.reserve"], regions: ["GLOBAL"], executionLevels: ["discover", "compare", "redirect"], auth: "api_key", access: "developer_account", officialDocs: "https://docs.developer.yelp.com/docs/places-intro", notes: "Business discovery and deeplinks." }),
  provider({ id: "taskrabbit", label: "Taskrabbit", domains: ["household"], capabilities: ["household.provider.search", "household.service.book"], regions: ["US", "CA", "EU", "GB"], executionLevels: ["discover", "prepare", "transact", "manage"], auth: "partner_oauth", access: "partner_approval", officialDocs: "https://developer.taskrabbit.com/", notes: "Partner access and regional capability availability apply." }),
  provider({ id: "instacart", label: "Instacart", domains: ["shopping"], capabilities: ["shopping.product.search", "shopping.list.manage"], regions: ["US", "CA"], executionLevels: ["discover", "prepare", "redirect"], auth: "api_key", access: "developer_account", officialDocs: "https://docs.instacart.com/developer_platform_api", notes: "Creates marketplace shopping-list experiences and hosted checkout links." }),
  provider({ id: "shopify-storefront", label: "Shopify Storefront", domains: ["shopping"], capabilities: ["shopping.product.search", "shopping.list.manage", "shopping.order.create"], regions: ["GLOBAL"], executionLevels: ["discover", "prepare", "redirect", "transact"], auth: "api_key", access: "developer_account", officialDocs: "https://shopify.dev/docs/api/storefront", notes: "Configured separately for each merchant storefront." }),
  provider({ id: "opentable", label: "OpenTable", domains: ["leisure"], capabilities: ["leisure.restaurant.reserve"], regions: ["GLOBAL"], executionLevels: ["discover", "redirect", "prepare", "transact", "manage"], auth: "partner_oauth", access: "partner_approval", officialDocs: "https://dev.opentable.com/", notes: "Directory links and deeper booking require the applicable partnership." }),
  provider({ id: "thefork", label: "TheFork", domains: ["leisure"], capabilities: ["leisure.restaurant.reserve"], regions: ["EU"], executionLevels: ["discover", "compare", "prepare", "transact", "manage"], auth: "partner_oauth", access: "partner_approval", officialDocs: "https://docs.thefork.io/B2B-API/introduction", notes: "B2B real-time availability and reservation lifecycle." }),
  provider({ id: "ticketmaster", label: "Ticketmaster", domains: ["leisure"], capabilities: ["leisure.event.search"], regions: ["GLOBAL"], executionLevels: ["discover", "compare", "redirect"], auth: "api_key", access: "developer_account", officialDocs: "https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/", notes: "Discovery and purchase URLs; transactional APIs are partner products." }),
  provider({ id: "home-assistant", label: "Home Assistant", domains: ["smart_home"], capabilities: ["home.device.read", "home.device.control", "home.energy.analyze"], regions: ["LOCAL", "GLOBAL"], executionLevels: ["discover", "prepare", "transact", "manage"], auth: "oauth", access: "local_user", officialDocs: "https://developers.home-assistant.io/docs/api/rest/", notes: "Local hub integration with explicit entity allowlists." }),
  provider({ id: "smartthings", label: "SmartThings", domains: ["smart_home"], capabilities: ["home.device.read", "home.device.control", "home.energy.analyze"], regions: ["GLOBAL"], executionLevels: ["discover", "prepare", "transact", "manage"], auth: "oauth", access: "developer_account", officialDocs: "https://developer.smartthings.com/docs/api/public", notes: "Devices, rooms, locations, commands, and API-created routines." }),
  provider({ id: "tibber", label: "Tibber", domains: ["smart_home"], capabilities: ["home.energy.analyze"], regions: ["EU"], executionLevels: ["discover", "compare", "prepare"], auth: "oauth", access: "developer_account", officialDocs: "https://developer.tibber.com/docs", notes: "Energy prices, consumption, production, and supported live measurements." }),
  provider({ id: "apple-healthkit", label: "Apple HealthKit", domains: ["wellness"], capabilities: ["wellness.activity.read"], regions: ["GLOBAL"], executionLevels: ["discover", "compare"], auth: "oauth", access: "local_user", officialDocs: "https://developer.apple.com/documentation/healthkit", notes: "Requires an iOS companion and on-device permission." }),
  provider({ id: "android-health-connect", label: "Android Health Connect", domains: ["wellness"], capabilities: ["wellness.activity.read"], regions: ["GLOBAL"], executionLevels: ["discover", "compare"], auth: "oauth", access: "local_user", officialDocs: "https://developer.android.com/health-and-fitness/health-connect", notes: "Requires an Android companion and user-granted record permissions." }),
  provider({ id: "fitbit", label: "Fitbit", domains: ["wellness"], capabilities: ["wellness.activity.read"], regions: ["GLOBAL"], executionLevels: ["discover", "compare"], auth: "oauth", access: "developer_account", officialDocs: "https://dev.fitbit.com/build/reference/web-api/", notes: "Activity, sleep, and supported wellness signals." }),
  provider({ id: "garmin-health", label: "Garmin Health", domains: ["wellness"], capabilities: ["wellness.activity.read"], regions: ["GLOBAL"], executionLevels: ["discover", "compare"], auth: "partner_oauth", access: "partner_approval", officialDocs: "https://developer.garmin.com/gc-developer-program/health-api/", notes: "Approval and commercial licensing may apply." }),
  provider({ id: "strava", label: "Strava", domains: ["wellness"], capabilities: ["wellness.activity.read", "wellness.plan.prepare"], regions: ["GLOBAL"], executionLevels: ["discover", "compare", "prepare"], auth: "oauth", access: "developer_account", officialDocs: "https://developers.strava.com/docs/", notes: "Read-only activity summaries with activity:read scope; private-only activities and write access are excluded." })
];

const capabilitiesByKey = new Map(lifeCapabilities.map((item) => [item.key, item]));

export function getLifeCapability(key: string) {
  return capabilitiesByKey.get(key) ?? null;
}

export function listLifeProviders(input: { capabilityKey?: string; region?: string } = {}) {
  const region = input.region?.trim().toUpperCase();
  return lifeProviders.filter((item) => {
    if (input.capabilityKey && !item.capabilities.includes(input.capabilityKey)) return false;
    if (!region) return true;
    return item.regions.includes(region) || item.regions.includes("GLOBAL") || (region === "DE" && item.regions.includes("EU"));
  });
}

export function routeLifeProviders(input: { capabilityKey: string; region?: string; requiredLevel?: ExecutionLevel }) {
  return listLifeProviders(input)
    .filter((item) => !input.requiredLevel || item.executionLevels.includes(input.requiredLevel))
    .sort((a, b) => {
      const accessRank = { public: 0, developer_account: 1, local_user: 1, partner_approval: 2, regulated_partner: 3 };
      return accessRank[a.access] - accessRank[b.access] || a.label.localeCompare(b.label);
    });
}
