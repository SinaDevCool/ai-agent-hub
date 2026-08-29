import { getWorkflowCapability, listWorkflowCapabilities, normalizeWorkflowCapability } from "./workflowCapabilityCatalog.js";
import { getLifeCapability, lifeCapabilities } from "./lifePlatformCatalog.js";

export type ConnectorAction = "search" | "quote" | "reserve" | "prepare_action" | "execute_action" | "sync_status" | "status" | "cancel";

export type ConnectorCapability = {
  key: string;
  canonicalKey: string;
  label: string;
  category: string;
  description: string;
  defaultAction: ConnectorAction;
  risk: "low" | "medium" | "high";
};

const capabilityAliases = new Map<string, string>([
  ["travel.hotel.search", "travel.search_hotels"],
  ["travel.hotels.search", "travel.search_hotels"],
  ["travel.flight.search", "travel.search_flights"],
  ["travel.flights.search", "travel.search_flights"],
  ["travel.car.search", "travel.search_cars"],
  ["travel.cars.search", "travel.search_cars"],
  ["travel.book", "travel.hold_or_book"],
  ["travel.booking", "travel.hold_or_book"],
  ["travel.trip.plan", "travel.plan_trip"],
  ["health.notes.organize", "health.organize_notes"],
  ["health.organizer", "health.organize_notes"],
  ["email.draft_follow_up", "email.follow_up"],
  ["finance.spending.review", "finance.review_spending"],
  ["research.general", "general.research"]
]);

const actionByCapability = new Map<string, ConnectorAction>([
  ["travel.search_hotels", "search"],
  ["travel.search_flights", "search"],
  ["travel.search_cars", "search"],
  ["travel.hold_or_book", "reserve"],
  ["travel.plan_trip", "search"],
  ["email.follow_up", "prepare_action"],
  ["finance.review_spending", "search"],
  ["health.organize_notes", "prepare_action"],
  ["general.research", "search"]
]);

const riskByCapability = new Map<string, ConnectorCapability["risk"]>([
  ["email.follow_up", "medium"],
  ["finance.review_spending", "medium"]
]);

export function normalizeConnectorCapability(key: string | undefined | null) {
  const trimmed = (key ?? "general.research").trim();
  const canonical = capabilityAliases.get(trimmed) ?? trimmed;
  return normalizeWorkflowCapability(canonical) ?? getLifeCapability(canonical)?.key ?? null;
}

export function getConnectorCapability(key: string | undefined | null): ConnectorCapability | null {
  const canonicalKey = normalizeConnectorCapability(key);
  if (!canonicalKey) return null;
  const workflowCapability = getWorkflowCapability(canonicalKey);
  const lifeCapability = getLifeCapability(canonicalKey);
  if (!workflowCapability && !lifeCapability) return null;
  return {
    key: key?.trim() || canonicalKey,
    canonicalKey,
    label: workflowCapability?.label ?? lifeCapability!.label,
    category: workflowCapability?.category ?? lifeCapability!.domain,
    description: workflowCapability?.description ?? lifeCapability!.description,
    defaultAction: actionByCapability.get(canonicalKey) ?? lifeCapability?.defaultAction ?? "search",
    risk: riskByCapability.get(canonicalKey) ?? lifeCapability?.risk ?? "medium"
  };
}

export function listConnectorCapabilities() {
  const existing = listWorkflowCapabilities().map((capability) => ({
    key: capability.key,
    canonicalKey: capability.key,
    label: capability.label,
    category: capability.category,
    description: capability.description,
    defaultAction: actionByCapability.get(capability.key) ?? "search",
    risk: riskByCapability.get(capability.key) ?? "medium",
    aliases: Array.from(capabilityAliases.entries())
      .filter(([, canonical]) => canonical === capability.key)
      .map(([alias]) => alias)
  }));
  const existingKeys = new Set(existing.map((item) => item.key));
  return existing.concat(lifeCapabilities.filter((item) => !existingKeys.has(item.key)).map((capability) => ({
    key: capability.key,
    canonicalKey: capability.key,
    label: capability.label,
    category: capability.domain,
    description: capability.description,
    defaultAction: capability.defaultAction,
    risk: capability.risk,
    aliases: [] as string[]
  })));
}
