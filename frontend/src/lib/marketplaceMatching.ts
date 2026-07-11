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
  queryIntent: string;
};

type SearchIntent = {
  normalizedSearch: string;
  typedTerms: string[];
  terms: string[];
  categories: string[];
  intentLabel: string;
};

const internalListingPatterns = [
  /\bqa\b/i,
  /\bsmoke\b/i,
  /\btest\b/i,
  /\bdemo\b/i,
  /review approve qa/i,
  /resubmit qa/i
];

const stopWords = new Set([
  "and",
  "for",
  "help",
  "with",
  "need",
  "the",
  "this",
  "that",
  "my",
  "me",
  "to",
  "a",
  "an",
  "i"
]);

const intentRules: Array<{ label: string; categories: string[]; terms: string[]; aliases: string[] }> = [
  { label: "travel planning", categories: ["Travel"], terms: ["travel", "trip", "flight", "hotel", "itinerary", "vacation", "booking", "weekend"], aliases: ["weekend trip", "cheap trip"] },
  { label: "money management", categories: ["Money", "Financial"], terms: ["money", "budget", "card", "payment", "subscription", "bill", "transfer"], aliases: ["save money", "spending"] },
  { label: "applications", categories: ["Applications", "Work", "Executive"], terms: ["apply", "applying", "application", "job", "jobs", "resume", "cv", "school", "college", "form"], aliases: ["applying for jobs", "job search"] },
  { label: "health notes", categories: ["Health", "Wellness"], terms: ["health", "medical", "doctor", "medicine", "symptom", "wellness", "notes"], aliases: ["health notes"] },
  { label: "daily tasks", categories: ["Daily Tasks", "Productivity"], terms: ["task", "errand", "reminder", "plan", "checklist", "schedule", "organize"], aliases: ["daily task", "to do"] },
  { label: "life admin", categories: ["Family", "Domestic", "Maintenance"], terms: ["family", "admin", "appointment", "paperwork", "document", "household"], aliases: ["life admin"] },
  { label: "shopping", categories: ["Shopping", "Home", "Domestic"], terms: ["shop", "shopping", "buy", "compare", "price", "purchase"], aliases: ["compare products"] },
  { label: "work communication", categories: ["Work", "Executive"], terms: ["email", "emails", "follow-up", "followup", "meeting", "reply", "draft", "work"], aliases: ["draft emails", "follow up emails", "follow-up emails"] }
];

const broadListingPattern = /\b(anything|everything|general|generic|broad|all[- ]?purpose|everyday requests|ai assistant)\b/i;

export function parseMarketplaceSearch(search: string): SearchIntent {
  const normalizedSearch = search.trim().toLowerCase();
  const typedTerms = normalizedSearch.split(/[^a-z0-9]+/).filter((term) => term.length > 1 && !stopWords.has(term));
  const matchedRules = intentRules.filter((rule) =>
    rule.terms.some((term) => typedTerms.includes(term) || normalizedSearch.includes(term))
    || rule.aliases.some((alias) => normalizedSearch.includes(alias))
  );
  const categories = Array.from(new Set(matchedRules.flatMap((rule) => rule.categories)));
  const expandedTerms = Array.from(new Set([...typedTerms, ...matchedRules.flatMap((rule) => rule.terms)]));
  return {
    normalizedSearch,
    typedTerms,
    terms: expandedTerms,
    categories,
    intentLabel: matchedRules[0]?.label ?? (normalizedSearch ? "your search" : "")
  };
}

export function isInternalMarketplaceAgent(agent: Pick<MarketplaceAgent, "name" | "slug" | "tagline" | "description">) {
  const text = [agent.name, agent.slug, agent.tagline, agent.description].join(" ");
  return internalListingPatterns.some((pattern) => pattern.test(text));
}

export function marketplaceCategoryMatches(agentCategory: string, selectedCategory: string) {
  if (selectedCategory === "All") return true;
  const normalized = friendlyCategoryName(agentCategory);
  if (normalized === selectedCategory || agentCategory === selectedCategory) return true;
  if (selectedCategory === "Daily Tasks" || selectedCategory === "Work") return normalized === "Productivity";
  if (selectedCategory === "Applications") return normalized === "Productivity" || normalized === "Executive";
  if (selectedCategory === "Family") return normalized === "Domestic" || normalized === "Maintenance";
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

function termHits(values: string[], terms: string[]) {
  return terms.filter((term) => {
    const candidates = term.endsWith("s") ? [term, term.slice(0, -1)] : [term];
    return values.some((value) => candidates.some((candidate) => value.includes(candidate)));
  }).length;
}

function directFieldHits(agent: MarketplaceAgent, terms: string[]) {
  const manifest = agent.versions[0]?.capabilityManifest ?? {};
  const directValues = [
    agent.name,
    agent.tagline,
    agent.description,
    ...(manifest.examplePrompts ?? []),
    ...(manifest.trustReasons ?? [])
  ].map((value) => value.toLowerCase());
  return termHits(directValues, terms);
}

function nameFieldHits(agent: MarketplaceAgent, terms: string[]) {
  return termHits([agent.name.toLowerCase()], terms);
}

function hasTrustGuidance(agent: MarketplaceAgent) {
  const manifest = agent.versions[0]?.capabilityManifest ?? {};
  return Boolean(agent.creator?.verified || manifest.trustReasons?.length || manifest.highRiskActions?.length);
}

function addReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) reasons.push(reason);
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
  const parsedSearch = parseMarketplaceSearch(search);
  const meaningfulTerms = parsedSearch.terms.filter((term) => !stopWords.has(term));
  const typedSpecificTerms = parsedSearch.typedTerms.filter((term) => !stopWords.has(term));
  const categoryIntentMatch = parsedSearch.categories.some((intentCategory) => marketplaceCategoryMatches(agent.category, intentCategory));
  const primaryIntentCategory = parsedSearch.categories[0] ?? "";
  const exactIntentCategoryMatch = Boolean(primaryIntentCategory)
    && (friendlyCategoryName(agent.category) === primaryIntentCategory || agent.category === primaryIntentCategory);
  const directHits = directFieldHits(agent, typedSpecificTerms);
  const nameHits = nameFieldHits(agent, typedSpecificTerms);
  const totalHits = termHits(values, typedSpecificTerms);
  const specificHitRatio = typedSpecificTerms.length ? totalHits / typedSpecificTerms.length : 1;
  const broadListing = broadListingPattern.test([agent.name, agent.tagline, agent.description].join(" "));
  const searchMatch = Boolean(search && (
    values.some((value) => value.includes(search))
    || meaningfulTerms.some((term) => values.some((value) => value.includes(term)))
    || categoryIntentMatch
  ));
  const reasons: string[] = [];
  let score = 0;

  if (category !== "All" && categoryMatch) {
    score += 36;
    addReason(reasons, `Matches ${category}`);
  }
  if (searchMatch) {
    score += 22;
    addReason(reasons, parsedSearch.intentLabel ? `Matches ${parsedSearch.intentLabel}` : "Matches your search");
  }
  if (directHits > 0) {
    score += Math.min(34, 14 + directHits * 5);
    if (!reasons.some((reason) => reason.startsWith("Matches"))) {
      addReason(reasons, parsedSearch.intentLabel ? `Matches ${parsedSearch.intentLabel}` : "Matches your words");
    }
  }
  if (totalHits > directHits) {
    score += Math.min(12, (totalHits - directHits) * 3);
  }
  if (nameHits > 0) {
    score += Math.min(16, nameHits * 8);
  }
  if (categoryIntentMatch && category === "All") {
    score += exactIntentCategoryMatch ? 24 : directHits > 0 ? 8 : 2;
    addReason(reasons, `Related to ${parsedSearch.intentLabel}`);
  }
  if (search && categoryIntentMatch && directHits === 0) {
    score -= 18;
  }
  if (search && parsedSearch.intentLabel && !categoryIntentMatch && directHits <= 1) {
    score -= 16;
  }
  if (search && broadListing && specificHitRatio < 0.7) {
    score -= 14;
  } else if (!search && broadListing) {
    score -= 4;
  }
  if (search && friendlyCategoryName(agent.category) === "Productivity" && directHits === 0 && parsedSearch.intentLabel !== "daily tasks") {
    score -= 10;
  }
  if (privateInfo === "yes" && hasPrivateInfo) {
    score += 14;
    addReason(reasons, `Uses ${friendlyList(manifest.requestedSchemas ?? [], "private info")}`);
  }
  if (privateInfo === "no" && !hasPrivateInfo) {
    score += 14;
    addReason(reasons, "Does not need private info");
  }
  if (privateInfo === "unsure") {
    if (!hasPrivateInfo) {
      score += 5;
      addReason(reasons, "No private info needed to start");
    } else if (asksBeforeRisk) {
      score += 2;
      addReason(reasons, "Private info stays under your control");
    }
  }
  if (actions === "yes" && canTakeActions) {
    score += 12;
    addReason(reasons, asksBeforeRisk ? "Can take actions with approval" : "Can take low-risk actions");
  }
  if (actions === "no" && !canTakeActions) {
    score += 12;
    addReason(reasons, "Read-only agent");
  }
  if (actions === "unsure") {
    if (!canTakeActions) {
      score += 4;
      addReason(reasons, "Read-only by default");
    } else if (asksBeforeRisk) {
      score += 3;
      addReason(reasons, "Actions pause for approval");
    }
  }
  if (filters.needsApproval && asksBeforeRisk) score += 8;
  if (filters.usesPrivateInfo && hasPrivateInfo) score += 6;
  if (filters.canTakeActions && canTakeActions) score += 6;

  if (hasTrustGuidance(agent)) score += 4;
  if (!manifest.description && !agent.description && !agent.tagline) score -= 12;
  score += Math.min(agent.trustScore, 100) / 16;
  score += Math.min(agent.averageRating, 5);
  score += Math.min(agent.installCount / 1000, 3);
  if (!installed) score += 8;
  if (installed) score -= 10;

  if (!reasons.length) {
    reasons.push(agent.creator?.verified ? "Verified creator profile" : "Visible safety profile");
  }
  if (!reasons.some((reason) => /approval|read-only/i.test(reason))) {
    reasons.push(asksBeforeRisk ? "Sensitive actions need approval" : "No listed risky actions");
  }

  return { agent, reasons: reasons.slice(0, 3), score, queryIntent: parsedSearch.intentLabel };
}
