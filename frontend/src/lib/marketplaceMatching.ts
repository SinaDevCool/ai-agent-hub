import type { MarketplaceAgent } from "../api/types";
import { friendlyCategoryName, friendlyList } from "./display";

export type MarketplaceFilters = {
  usesPrivateInfo: boolean;
  canTakeActions: boolean;
  needsApproval: boolean;
};

export type MarketplaceNeed = {
  id: string;
  title: string;
  detail: string;
  category: string;
  query: string;
};

export type MatcherChoice = "unsure" | "yes" | "no";

export type MarketplaceMatch = {
  agent: MarketplaceAgent;
  reasons: string[];
  score: number;
};

export function marketplaceCategoryMatches(agentCategory: string, selectedCategory: string) {
  if (selectedCategory === "All") return true;
  const normalized = friendlyCategoryName(agentCategory);
  if (normalized === selectedCategory || agentCategory === selectedCategory) return true;
  if (selectedCategory === "Daily Tasks" || selectedCategory === "Work") return normalized === "Productivity";
  if (selectedCategory === "Shopping") return normalized === "Home";
  return false;
}

export function marketplaceSearchValues(agent: MarketplaceAgent) {
  const manifest = agent.versions[0]?.capabilityManifest ?? {};
  return [
    agent.name,
    agent.tagline,
    agent.description,
    agent.category,
    friendlyCategoryName(agent.category),
    ...(manifest.tools ?? []),
    ...(manifest.requestedSchemas ?? []),
    ...(manifest.highRiskActions ?? []),
    ...(manifest.examplePrompts ?? []),
    ...(manifest.trustReasons ?? [])
  ];
}

export function scoreMarketplaceAgent(input: {
  agent: MarketplaceAgent;
  category: string;
  search: string;
  filters: MarketplaceFilters;
  privateInfo: MatcherChoice;
  actions: MatcherChoice;
  installed: boolean;
}): MarketplaceMatch {
  const { agent, category, search, filters, privateInfo, actions, installed } = input;
  const manifest = agent.versions[0]?.capabilityManifest ?? {};
  const hasPrivateInfo = Boolean(manifest.requestedSchemas?.length);
  const canTakeActions = Boolean(manifest.tools?.includes("action.execute"));
  const asksBeforeRisk = Boolean(manifest.highRiskActions?.length);
  const categoryMatch = marketplaceCategoryMatches(agent.category, category);
  const values = marketplaceSearchValues(agent).map((value) => value.toLowerCase());
  const searchMatch = Boolean(search && values.some((value) => value.includes(search)));
  const reasons: string[] = [];
  let score = 0;

  if (category !== "All" && categoryMatch) {
    score += 36;
    reasons.push(`Matches ${category}`);
  }
  if (searchMatch) {
    score += 24;
    reasons.push("Fits your search");
  }
  if (privateInfo === "yes" && hasPrivateInfo) {
    score += 14;
    reasons.push(`Uses ${friendlyList(manifest.requestedSchemas ?? [], "private info")}`);
  }
  if (privateInfo === "no" && !hasPrivateInfo) {
    score += 14;
    reasons.push("Does not need private info");
  }
  if (actions === "yes" && canTakeActions) {
    score += 12;
    reasons.push(asksBeforeRisk ? "Can take actions with approval" : "Can take low-risk actions");
  }
  if (actions === "no" && !canTakeActions) {
    score += 12;
    reasons.push("Read-only helper");
  }
  if (filters.needsApproval && asksBeforeRisk) score += 8;
  if (filters.usesPrivateInfo && hasPrivateInfo) score += 6;
  if (filters.canTakeActions && canTakeActions) score += 6;

  score += Math.min(agent.trustScore, 100) / 10;
  score += Math.min(agent.averageRating, 5) * 2;
  score += Math.min(agent.installCount / 250, 8);
  if (!installed) score += 8;
  if (installed) score -= 10;

  if (!reasons.length) {
    reasons.push(agent.creator?.verified ? "Verified creator profile" : "Visible safety profile");
  }
  if (!reasons.some((reason) => /approval|read-only/i.test(reason))) {
    reasons.push(asksBeforeRisk ? "Sensitive actions need approval" : "No listed risky actions");
  }

  return { agent, reasons: reasons.slice(0, 3), score };
}
