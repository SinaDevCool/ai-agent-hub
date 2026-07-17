import { getConnectorCapability, normalizeConnectorCapability } from "./connectorCapabilityService.js";

export type AgentCapabilityMappingInput = {
  name?: string;
  description?: string;
  category?: string;
  sourceType?: string;
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
  }>;
  operations?: Array<{
    operationId?: string;
    path?: string;
    method?: string;
    summary?: string;
    description?: string;
  }>;
  declaredCapabilities?: string[];
  hints?: string[];
};

export type AgentCapabilityMapping = {
  canonicalCapability: string;
  label: string;
  confidence: number;
  sourceReason: string;
  matchedSignals: string[];
  needsReview: boolean;
};

export type AgentCapabilityMappingResult = {
  mappings: AgentCapabilityMapping[];
  unmappedSignals: string[];
  reviewWarnings: string[];
};

type Candidate = {
  capability: string;
  confidence: number;
  sourceReason: string;
  matchedSignals: string[];
};

const keywordRules: Array<{
  capability: string;
  confidence: number;
  reason: string;
  pattern: RegExp;
}> = [
  {
    capability: "travel.search_hotels",
    confidence: 0.86,
    reason: "Matched hotel, stay, lodging, or accommodation terms.",
    pattern: /\b(hotel|hotels|stay|stays|lodging|accommodation|booking\.com|room|rooms|check[-_ ]?in|check[-_ ]?out|guest|guests)\b/i
  },
  {
    capability: "travel.search_flights",
    confidence: 0.86,
    reason: "Matched flight, airline, airport, or route terms.",
    pattern: /\b(flight|flights|airline|airport|skyscanner|plane|origin|destination|departure|arrival)\b/i
  },
  {
    capability: "travel.search_cars",
    confidence: 0.84,
    reason: "Matched car rental or vehicle hire terms.",
    pattern: /\b(car rental|rental car|rent a car|vehicle rental|vehicle hire|car hire|pickup location|dropoff|drop[-_ ]?off)\b/i
  },
  {
    capability: "travel.hold_or_book",
    confidence: 0.82,
    reason: "Matched booking, reservation, checkout, or non-refundable action terms.",
    pattern: /\b(book|booking|reserve|reservation|hold|checkout|non[-_ ]?refundable|confirm purchase)\b/i
  },
  {
    capability: "travel.plan_trip",
    confidence: 0.78,
    reason: "Matched trip planning or itinerary terms.",
    pattern: /\b(trip|itinerary|vacation|holiday|travel plan|travel planning|route plan)\b/i
  },
  {
    capability: "email.follow_up",
    confidence: 0.84,
    reason: "Matched email, inbox, reply, follow-up, or Gmail terms.",
    pattern: /\b(email|inbox|reply|follow[-_ ]?up|gmail|subject|message body|draft)\b/i
  },
  {
    capability: "finance.review_spending",
    confidence: 0.84,
    reason: "Matched spending, transaction, budget, card, or bank terms.",
    pattern: /\b(budget|spend|spending|transaction|transactions|expense|expenses|merchant|card|bank|amount|payment)\b/i
  },
  {
    capability: "health.organize_notes",
    confidence: 0.86,
    reason: "Matched health, medical notes, medication, or diagnosis terms.",
    pattern: /\b(medical|health|note|notes|symptom|symptoms|medication|diagnosis|medical history|patient)\b/i
  },
  {
    capability: "general.research",
    confidence: 0.62,
    reason: "Matched general research, web search, comparison, or information-finding terms.",
    pattern: /\b(research|search web|web search|compare|find info|find information|lookup|look up)\b/i
  }
];

function signalText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function addCandidate(candidates: Candidate[], candidate: Candidate) {
  const normalized = normalizeConnectorCapability(candidate.capability);
  if (!normalized) return;
  const existing = candidates.find((item) => item.capability === normalized);
  if (!existing) {
    candidates.push({ ...candidate, capability: normalized, matchedSignals: Array.from(new Set(candidate.matchedSignals)) });
    return;
  }
  existing.confidence = Math.max(existing.confidence, candidate.confidence);
  existing.matchedSignals = Array.from(new Set([...existing.matchedSignals, ...candidate.matchedSignals]));
  if (candidate.confidence >= existing.confidence) existing.sourceReason = candidate.sourceReason;
}

function normalizeDeclaredCapabilities(input: AgentCapabilityMappingInput, candidates: Candidate[], unmappedSignals: string[]) {
  for (const declared of input.declaredCapabilities ?? []) {
    const normalized = normalizeConnectorCapability(declared);
    if (!normalized) {
      unmappedSignals.push(declared);
      continue;
    }
    addCandidate(candidates, {
      capability: normalized,
      confidence: normalized === declared ? 0.95 : 0.9,
      sourceReason: normalized === declared ? "Declared by source manifest." : "Mapped from a known capability alias.",
      matchedSignals: [declared]
    });
  }
}

function collectTextSignals(input: AgentCapabilityMappingInput) {
  const signals: Array<{ label: string; text: string }> = [
    { label: "name", text: signalText(input.name) },
    { label: "description", text: signalText(input.description) },
    { label: "category", text: signalText(input.category) },
    { label: "sourceType", text: signalText(input.sourceType) },
    { label: "hints", text: (input.hints ?? []).map(signalText).join(" ") }
  ];

  for (const tool of input.tools ?? []) {
    signals.push({ label: `tool:${tool.name}`, text: [tool.name, tool.description, signalText(tool.inputSchema), signalText(tool.outputSchema)].filter(Boolean).join(" ") });
  }
  for (const operation of input.operations ?? []) {
    signals.push({
      label: `operation:${operation.operationId ?? operation.method ?? "unknown"}`,
      text: [
        operation.operationId,
        operation.path,
        operation.method,
        operation.summary,
        operation.description
      ].filter(Boolean).join(" ")
    });
  }
  return signals.filter((signal) => signal.text.trim());
}

function mapKeywordSignals(input: AgentCapabilityMappingInput, candidates: Candidate[]) {
  for (const signal of collectTextSignals(input)) {
    for (const rule of keywordRules) {
      if (!rule.pattern.test(signal.text)) continue;
      addCandidate(candidates, {
        capability: rule.capability,
        confidence: rule.confidence,
        sourceReason: rule.reason,
        matchedSignals: [signal.label]
      });
    }
  }
}

function fallbackMapping(candidates: Candidate[], unmappedSignals: string[]) {
  if (candidates.length) return;
  addCandidate(candidates, {
    capability: "general.research",
    confidence: 0.35,
    sourceReason: "No strong capability signal was found; defaulted to general research.",
    matchedSignals: ["fallback"]
  });
  if (!unmappedSignals.length) unmappedSignals.push("No strong tool, operation, schema, or description match.");
}

export function mapAgentCapabilities(input: AgentCapabilityMappingInput): AgentCapabilityMappingResult {
  const candidates: Candidate[] = [];
  const unmappedSignals: string[] = [];
  normalizeDeclaredCapabilities(input, candidates, unmappedSignals);
  mapKeywordSignals(input, candidates);
  fallbackMapping(candidates, unmappedSignals);

  const mappings = candidates
    .sort((a, b) => b.confidence - a.confidence || a.capability.localeCompare(b.capability))
    .map((candidate) => {
      const capability = getConnectorCapability(candidate.capability);
      const confidence = Number(candidate.confidence.toFixed(2));
      return {
        canonicalCapability: capability?.canonicalKey ?? candidate.capability,
        label: capability?.label ?? candidate.capability,
        confidence,
        sourceReason: candidate.sourceReason,
        matchedSignals: candidate.matchedSignals,
        needsReview: confidence < 0.8
      };
    });

  return {
    mappings,
    unmappedSignals: Array.from(new Set(unmappedSignals)),
    reviewWarnings: mappings
      .filter((mapping) => mapping.needsReview)
      .map((mapping) => `Capability '${mapping.canonicalCapability}' should be reviewed because confidence is ${mapping.confidence}.`)
  };
}

