import { describe, expect, it } from "vitest";
import type { MarketplaceAgent } from "../api/types";
import {
  isInternalMarketplaceAgent,
  marketplaceCategoryMatches,
  marketplaceSearchValues,
  parseMarketplaceSearch,
  scoreMarketplaceAgent,
  type MarketplaceFilters,
  type MatcherChoice
} from "./marketplaceMatching";

const defaultFilters: MarketplaceFilters = {
  usesPrivateInfo: false,
  canTakeActions: false,
  needsApproval: false
};

function makeMarketplaceAgent(overrides: Partial<MarketplaceAgent> = {}): MarketplaceAgent {
  const manifest = overrides.versions?.[0]?.capabilityManifest ?? {};
  const id = overrides.id ?? "agent-travel";
  return {
    id,
    slug: overrides.slug ?? id,
    name: overrides.name ?? "Trip Companion",
    tagline: overrides.tagline ?? "Plans trips, bookings, and loyalty details",
    description: overrides.description ?? "Helps organize travel plans and asks before booking anything important.",
    category: overrides.category ?? "Travel",
    status: overrides.status ?? "published",
    trustScore: overrides.trustScore ?? 70,
    installCount: overrides.installCount ?? 100,
    averageRating: overrides.averageRating ?? 4.5,
    installed: overrides.installed,
    matchScore: overrides.matchScore,
    matchReasons: overrides.matchReasons,
    moderationNote: overrides.moderationNote,
    submittedForReviewAt: overrides.submittedForReviewAt,
    reviewedAt: overrides.reviewedAt,
    reviewedByUserId: overrides.reviewedByUserId,
    creator: overrides.creator ?? { displayName: "Verified Studio", verified: true },
    versions: [{
      id: overrides.versions?.[0]?.id ?? `${id}-version`,
      version: overrides.versions?.[0]?.version ?? "1.0.0",
      apiProtocol: overrides.versions?.[0]?.apiProtocol ?? "MCP",
      capabilityManifest: {
        protocol: manifest.protocol ?? "MCP",
        tools: manifest.tools ?? ["vault.search", "action.execute"],
        requestedSchemas: manifest.requestedSchemas ?? ["Frequent Flyer Ledger"],
        highRiskActions: manifest.highRiskActions ?? ["book_non_refundable_travel"],
        description: manifest.description ?? "Travel planning with approval gates.",
        examplePrompts: manifest.examplePrompts ?? ["Plan a three day Lisbon weekend under $900"],
        trustReasons: manifest.trustReasons ?? ["Cannot read private info until approved"]
      }
    }]
  };
}

function score(agent: MarketplaceAgent, input: Partial<{
  category: string;
  search: string;
  filters: MarketplaceFilters;
  privateInfo: MatcherChoice;
  actions: MatcherChoice;
  installed: boolean;
}> = {}) {
  return scoreMarketplaceAgent({
    agent,
    category: input.category ?? "All",
    search: input.search ?? "",
    filters: input.filters ?? defaultFilters,
    privateInfo: input.privateInfo ?? "unsure",
    actions: input.actions ?? "unsure",
    installed: input.installed ?? Boolean(agent.installed)
  });
}

describe("marketplaceCategoryMatches", () => {
  it("matches all, exact categories, and B2C category aliases", () => {
    expect(marketplaceCategoryMatches("Travel", "All")).toBe(true);
    expect(marketplaceCategoryMatches("Travel", "Travel")).toBe(true);
    expect(marketplaceCategoryMatches("Financial", "Money")).toBe(true);
    expect(marketplaceCategoryMatches("Executive", "Daily Tasks")).toBe(true);
    expect(marketplaceCategoryMatches("Executive", "Work")).toBe(true);
    expect(marketplaceCategoryMatches("Executive", "Applications")).toBe(true);
    expect(marketplaceCategoryMatches("Maintenance", "Family")).toBe(true);
    expect(marketplaceCategoryMatches("Domestic", "Shopping")).toBe(true);
  });

  it("does not match unrelated need categories", () => {
    expect(marketplaceCategoryMatches("Legal", "Travel")).toBe(false);
    expect(marketplaceCategoryMatches("Wellness", "Money")).toBe(false);
    expect(marketplaceCategoryMatches("Maintenance", "Work")).toBe(false);
  });
});

describe("marketplaceSearchValues", () => {
  it("indexes user-facing fields and manifest safety details", () => {
    const agent = makeMarketplaceAgent({
      name: "Job Application Coach",
      tagline: "Resumes and cover letters",
      description: "Helps apply for jobs and draft follow-up email.",
      category: "Executive",
      versions: [{
        id: "job-v1",
        version: "1.0.0",
        apiProtocol: "MCP",
        capabilityManifest: {
          tools: ["vault.search", "email.draft"],
          requestedSchemas: ["Career Profile"],
          highRiskActions: ["send_application_email"],
          examplePrompts: ["Tailor my resume for this product role"],
          trustReasons: ["Drafts emails before sending"]
        }
      }]
    });

    expect(marketplaceSearchValues(agent)).toEqual(expect.arrayContaining([
      "Job Application Coach",
      "Resumes and cover letters",
      "Helps apply for jobs and draft follow-up email.",
      "Executive",
      "Productivity",
      "vault.search",
      "email.draft",
      "Career Profile",
      "send_application_email",
      "Tailor my resume for this product role",
      "Drafts emails before sending"
    ]));
  });
});

describe("scoreMarketplaceAgent", () => {
  it("adds category and search reasons for direct matches", () => {
    const match = score(makeMarketplaceAgent(), { category: "Travel", search: "lisbon" });

    expect(match.score).toBeGreaterThan(60);
    expect(match.reasons).toContain("Matches Travel");
    expect(match.reasons).toContain("Matches your search");
  });

  it("parses natural-language goals into marketplace intent", () => {
    const intent = parseMarketplaceSearch("I need help applying for jobs and fixing my resume");

    expect(intent.intentLabel).toBe("applications");
    expect(intent.categories).toEqual(expect.arrayContaining(["Applications", "Work", "Executive"]));
    expect(intent.terms).toEqual(expect.arrayContaining(["apply", "job", "resume"]));
  });

  it("boosts uninstalled helpers and penalizes installed helpers", () => {
    const agent = makeMarketplaceAgent();
    const uninstalled = score(agent, { category: "Travel", installed: false });
    const installed = score(agent, { category: "Travel", installed: true });

    expect(uninstalled.score).toBeGreaterThan(installed.score);
  });

  it("rewards private-info and read-only preferences", () => {
    const privateInfoAgent = makeMarketplaceAgent();
    const readOnlyAgent = makeMarketplaceAgent({
      id: "read-only",
      name: "Read Only Helper",
      versions: [{
        id: "read-only-v1",
        version: "1.0.0",
        apiProtocol: "MCP",
        capabilityManifest: {
          tools: ["web.fetch"],
          requestedSchemas: [],
          highRiskActions: [],
          examplePrompts: ["Summarize this public page"],
          trustReasons: ["Does not request private info"]
        }
      }]
    });

    expect(score(privateInfoAgent, { privateInfo: "yes" }).reasons).toContain("Uses Frequent Flyer Ledger");
    expect(score(readOnlyAgent, { privateInfo: "no" }).reasons).toContain("Does not need private info");
  });

  it("rewards action-capable, read-only, and approval-filter matches", () => {
    const actionAgent = makeMarketplaceAgent();
    const readOnlyAgent = makeMarketplaceAgent({
      id: "read-only",
      versions: [{
        id: "read-only-v1",
        version: "1.0.0",
        apiProtocol: "MCP",
        capabilityManifest: {
          tools: ["vault.search"],
          requestedSchemas: ["Travel Preferences"],
          highRiskActions: [],
          examplePrompts: ["Find my travel preferences"],
          trustReasons: []
        }
      }]
    });

    expect(score(actionAgent, { actions: "yes" }).reasons).toContain("Can take actions with approval");
    expect(score(readOnlyAgent, { actions: "no" }).reasons).toContain("Read-only agent");
    expect(score(actionAgent, { filters: { ...defaultFilters, needsApproval: true } }).score)
      .toBeGreaterThan(score(actionAgent).score);
  });

  it("keeps category and search relevance ahead of generic trust", () => {
    const relevant = makeMarketplaceAgent({
      trustScore: 40,
      averageRating: 3.5,
      installCount: 10
    });
    const genericTrusted = makeMarketplaceAgent({
      id: "trusted-generic",
      name: "Trusted Generic Helper",
      tagline: "General AI assistant",
      description: "Helps with broad questions.",
      category: "Legal",
      trustScore: 100,
      averageRating: 5,
      installCount: 5000,
      versions: [{
        id: "trusted-generic-v1",
        version: "1.0.0",
        apiProtocol: "MCP",
        capabilityManifest: {
          tools: ["vault.search"],
          requestedSchemas: [],
          highRiskActions: [],
          examplePrompts: ["Help me think through this"],
          trustReasons: ["Highly rated"]
        }
      }]
    });

    expect(score(relevant, { category: "Travel", search: "lisbon" }).score)
      .toBeGreaterThan(score(genericTrusted, { category: "Travel", search: "lisbon" }).score);
  });
});

describe("B2C discovery scenarios", () => {
  it("ranks travel helpers above generic helpers for trip needs", () => {
    const travel = makeMarketplaceAgent();
    const generic = makeMarketplaceAgent({
      id: "generic",
      name: "General Helper",
      category: "Custom",
      tagline: "Helps with anything",
      description: "A broad helper for everyday requests."
    });

    expect(score(travel, { category: "Travel", search: "travel" }).score)
      .toBeGreaterThan(score(generic, { category: "Travel", search: "travel" }).score);
  });

  it("ranks money helpers above daily helpers for budget needs", () => {
    const money = makeMarketplaceAgent({
      id: "money",
      name: "Budget Guard",
      category: "Financial",
      description: "Tracks budget, cards, and payment preferences.",
      versions: [{
        id: "money-v1",
        version: "1.0.0",
        apiProtocol: "MCP",
        capabilityManifest: {
          tools: ["vault.search", "action.execute"],
          requestedSchemas: ["Financial Preferences"],
          highRiskActions: ["transfer_funds"],
          examplePrompts: ["Help me reduce spending this month"],
          trustReasons: ["Asks before money movement"]
        }
      }]
    });
    const daily = makeMarketplaceAgent({
      id: "daily",
      name: "Daily Task Helper",
      category: "Executive",
      description: "Plans reminders and errands."
    });

    expect(score(money, { category: "Money", search: "budget" }).score)
      .toBeGreaterThan(score(daily, { category: "Money", search: "budget" }).score);
  });

  it("ranks work helpers above shopping helpers for email needs", () => {
    const work = makeMarketplaceAgent({
      id: "work",
      name: "Inbox Follow-Up Helper",
      category: "Executive",
      description: "Drafts email follow-ups and schedules replies.",
      versions: [{
        id: "work-v1",
        version: "1.0.0",
        apiProtocol: "MCP",
        capabilityManifest: {
          tools: ["email.draft", "calendar.read"],
          requestedSchemas: ["Contact Preferences"],
          highRiskActions: ["send_email"],
          examplePrompts: ["Draft a polite follow-up email"],
          trustReasons: ["Drafts before sending"]
        }
      }]
    });
    const shopping = makeMarketplaceAgent({
      id: "shopping",
      name: "Shopping Scout",
      category: "Domestic",
      description: "Compares products and subscriptions."
    });

    expect(score(work, { category: "Work", search: "email" }).score)
      .toBeGreaterThan(score(shopping, { category: "Work", search: "email" }).score);
  });

  it("maps shopping needs to domestic home helpers", () => {
    const shopping = makeMarketplaceAgent({
      id: "shopping",
      name: "Shopping Scout",
      category: "Domestic",
      description: "Compares shopping options and subscriptions."
    });

    expect(score(shopping, { category: "Shopping", search: "shopping" }).reasons)
      .toEqual(expect.arrayContaining(["Matches Shopping", "Matches shopping"]));
  });

  it("ranks application helpers for plain-language job application searches", () => {
    const application = makeMarketplaceAgent({
      id: "application",
      name: "Application Coach",
      category: "Executive",
      description: "Helps tailor resumes, cover letters, forms, and job application follow-ups.",
      versions: [{
        id: "application-v1",
        version: "1.0.0",
        apiProtocol: "MCP",
        capabilityManifest: {
          tools: ["vault.search", "email.draft"],
          requestedSchemas: ["Personal Identity Profile"],
          highRiskActions: ["submit_application"],
          examplePrompts: ["Tailor my resume to this role"],
          trustReasons: ["Drafts before submitting"]
        }
      }]
    });
    const travel = makeMarketplaceAgent();

    expect(score(application, { category: "All", search: "I need help applying for jobs" }).score)
      .toBeGreaterThan(score(travel, { category: "All", search: "I need help applying for jobs" }).score);
  });

  it("keeps generic daily helpers below specific application helpers even when popular", () => {
    const application = makeMarketplaceAgent({
      id: "application",
      name: "Job Application Coach",
      category: "Executive",
      trustScore: 70,
      installCount: 15,
      description: "Tailors resumes, cover letters, forms, job applications, and follow-up emails.",
      versions: [{
        id: "application-v1",
        version: "1.0.0",
        apiProtocol: "MCP",
        capabilityManifest: {
          tools: ["vault.search", "email.draft"],
          requestedSchemas: ["Career Profile"],
          highRiskActions: ["submit_application"],
          examplePrompts: ["Help me apply for this job"],
          trustReasons: ["Drafts before submitting"]
        }
      }]
    });
    const generic = makeMarketplaceAgent({
      id: "generic-daily",
      name: "Daily Task Helper",
      category: "Executive",
      trustScore: 100,
      installCount: 5000,
      description: "Plans reminders, errands, checklists, and everyday organization.",
      versions: [{
        id: "generic-daily-v1",
        version: "1.0.0",
        apiProtocol: "MCP",
        capabilityManifest: {
          tools: ["vault.search"],
          requestedSchemas: ["Task List"],
          highRiskActions: [],
          examplePrompts: ["Organize my day"],
          trustReasons: ["Popular helper"]
        }
      }]
    });

    expect(score(application, { category: "All", search: "I need help applying for jobs" }).score)
      .toBeGreaterThan(score(generic, { category: "All", search: "I need help applying for jobs" }).score);
  });

  it("prefers safer comparable agents when the user is unsure about access and actions", () => {
    const safeReadOnly = makeMarketplaceAgent({
      id: "safe-read-only",
      name: "Travel Idea Finder",
      category: "Travel",
      description: "Finds travel ideas and compares itinerary options without reading private info.",
      versions: [{
        id: "safe-read-only-v1",
        version: "1.0.0",
        apiProtocol: "MCP",
        capabilityManifest: {
          tools: ["web.fetch"],
          requestedSchemas: [],
          highRiskActions: [],
          examplePrompts: ["Compare weekend trip ideas"],
          trustReasons: ["Does not request private info"]
        }
      }]
    });
    const actionHeavy = makeMarketplaceAgent({
      id: "action-heavy",
      name: "Travel Booking Agent",
      category: "Travel",
      description: "Plans travel and can book trips after approval.",
      versions: [{
        id: "action-heavy-v1",
        version: "1.0.0",
        apiProtocol: "MCP",
        capabilityManifest: {
          tools: ["vault.search", "action.execute"],
          requestedSchemas: ["Frequent Flyer Ledger", "Payment Preferences"],
          highRiskActions: ["book_non_refundable_travel"],
          examplePrompts: ["Book a weekend trip"],
          trustReasons: ["Asks before booking"]
        }
      }]
    });

    expect(score(safeReadOnly, { category: "Travel", search: "compare weekend trip ideas" }).score)
      .toBeGreaterThan(score(actionHeavy, { category: "Travel", search: "compare weekend trip ideas" }).score);
  });

  it("penalizes vague broad listings for concrete B2C needs", () => {
    const specific = makeMarketplaceAgent({
      id: "specific-email",
      name: "Email Follow-Up Agent",
      category: "Executive",
      description: "Drafts email replies, follow-ups, and meeting notes.",
      versions: [{
        id: "specific-email-v1",
        version: "1.0.0",
        apiProtocol: "MCP",
        capabilityManifest: {
          tools: ["email.draft"],
          requestedSchemas: [],
          highRiskActions: ["send_email"],
          examplePrompts: ["Draft a follow-up email"],
          trustReasons: ["Drafts before sending"]
        }
      }]
    });
    const vague = makeMarketplaceAgent({
      id: "vague",
      name: "General AI Assistant",
      category: "Custom",
      trustScore: 100,
      installCount: 5000,
      averageRating: 5,
      tagline: "Helps with anything and everyday requests",
      description: "A broad all-purpose assistant."
    });

    expect(score(specific, { category: "All", search: "handle emails" }).score)
      .toBeGreaterThan(score(vague, { category: "All", search: "handle emails" }).score);
  });

  it("ranks health helpers above generic productivity helpers for health note searches", () => {
    const health = makeMarketplaceAgent({
      id: "health",
      name: "Health Notes Organizer",
      category: "Wellness",
      description: "Organizes doctor notes, medicines, symptoms, and questions for appointments.",
      versions: [{
        id: "health-v1",
        version: "1.0.0",
        apiProtocol: "MCP",
        capabilityManifest: {
          tools: ["vault.search"],
          requestedSchemas: ["Health Notes"],
          highRiskActions: [],
          examplePrompts: ["Organize my health notes before my doctor visit"],
          trustReasons: ["Does not give medical decisions"]
        }
      }]
    });
    const generic = makeMarketplaceAgent({
      id: "generic",
      name: "Daily Task Helper",
      category: "Executive",
      description: "Organizes everyday tasks and schedules."
    });

    expect(score(health, { category: "All", search: "organize health notes" }).score)
      .toBeGreaterThan(score(generic, { category: "All", search: "organize health notes" }).score);
  });

  it("maps the six first-run starter goals to the strongest helper family", () => {
    const candidates = [
      makeMarketplaceAgent({
        id: "travel",
        name: "Trip Planner",
        category: "Travel",
        description: "Plans trips, hotels, flights, itinerary ideas, and booking guardrails.",
        versions: [{
          id: "travel-v1",
          version: "1.0.0",
          apiProtocol: "MCP",
          capabilityManifest: {
            tools: ["vault.search", "action.execute"],
            requestedSchemas: ["Frequent Flyer Ledger"],
            highRiskActions: ["book_non_refundable_travel"],
            examplePrompts: ["Plan a trip around my travel preferences"],
            trustReasons: ["Asks before booking"]
          }
        }]
      }),
      makeMarketplaceAgent({
        id: "applications",
        name: "Job Application Coach",
        category: "Executive",
        description: "Helps apply for jobs with resumes, cover letters, forms, and follow-up emails.",
        versions: [{
          id: "applications-v1",
          version: "1.0.0",
          apiProtocol: "MCP",
          capabilityManifest: {
            tools: ["vault.search", "email.draft"],
            requestedSchemas: ["Career Profile"],
            highRiskActions: ["submit_application"],
            examplePrompts: ["Draft a resume summary for this job"],
            trustReasons: ["Drafts before submitting"]
          }
        }]
      }),
      makeMarketplaceAgent({
        id: "money",
        name: "Money Budget Guard",
        category: "Financial",
        description: "Manages money, bills, subscriptions, budget questions, cards, and payment preferences.",
        versions: [{
          id: "money-v1",
          version: "1.0.0",
          apiProtocol: "MCP",
          capabilityManifest: {
            tools: ["vault.search", "action.execute"],
            requestedSchemas: ["Financial Preferences"],
            highRiskActions: ["transfer_funds"],
            examplePrompts: ["Manage money and reduce spending this month"],
            trustReasons: ["Cannot move money without approval"]
          }
        }]
      }),
      makeMarketplaceAgent({
        id: "email",
        name: "Email Follow-Up Helper",
        category: "Executive",
        description: "Handles emails by drafting replies, follow-ups, and scheduling notes.",
        versions: [{
          id: "email-v1",
          version: "1.0.0",
          apiProtocol: "MCP",
          capabilityManifest: {
            tools: ["vault.search", "email.draft"],
            requestedSchemas: ["Contact Preferences"],
            highRiskActions: ["send_email"],
            examplePrompts: ["Handle emails and draft a follow-up"],
            trustReasons: ["Never sends without approval"]
          }
        }]
      }),
      makeMarketplaceAgent({
        id: "health",
        name: "Health Notes Organizer",
        category: "Wellness",
        description: "Organizes health notes, medicines, symptoms, doctor questions, and appointment context.",
        versions: [{
          id: "health-v1",
          version: "1.0.0",
          apiProtocol: "MCP",
          capabilityManifest: {
            tools: ["vault.search"],
            requestedSchemas: ["Health Notes"],
            highRiskActions: ["share_medical_record"],
            examplePrompts: ["Organize health notes before my doctor visit"],
            trustReasons: ["Keeps health details restricted"]
          }
        }]
      }),
      makeMarketplaceAgent({
        id: "shopping",
        name: "Purchase Comparison Helper",
        category: "Domestic",
        description: "Compares purchases, prices, products, shopping options, and subscriptions.",
        versions: [{
          id: "shopping-v1",
          version: "1.0.0",
          apiProtocol: "MCP",
          capabilityManifest: {
            tools: ["vault.search", "action.execute"],
            requestedSchemas: ["Financial Preferences"],
            highRiskActions: ["buy_item"],
            examplePrompts: ["Compare purchases and pick the best option"],
            trustReasons: ["Asks before buying"]
          }
        }]
      })
    ];
    const scenarios = [
      { search: "Plan a trip", expectedId: "travel" },
      { search: "Apply for jobs", expectedId: "applications" },
      { search: "Manage money", expectedId: "money" },
      { search: "Handle emails", expectedId: "email" },
      { search: "Organize health notes", expectedId: "health" },
      { search: "Compare purchases", expectedId: "shopping" }
    ];

    for (const scenario of scenarios) {
      const topMatch = candidates
        .map((agent) => score(agent, { category: "All", search: scenario.search }))
        .sort((left, right) => right.score - left.score)[0];

      expect(topMatch.agent.id, scenario.search).toBe(scenario.expectedId);
      expect(topMatch.reasons.length, scenario.search).toBeGreaterThan(0);
    }
  });

  it("identifies internal helpers that should not appear in public browsing", () => {
    expect(isInternalMarketplaceAgent(makeMarketplaceAgent({ name: "QA Helper Travel" }))).toBe(true);
    expect(isInternalMarketplaceAgent(makeMarketplaceAgent({ slug: "smoke-weekend-trip" }))).toBe(true);
    expect(isInternalMarketplaceAgent(makeMarketplaceAgent({ name: "Weekend Trip Planner", slug: "weekend-trip-planner" }))).toBe(false);
  });

  it("lets an uninstalled comparable helper outrank an installed one", () => {
    const installedTravel = makeMarketplaceAgent({
      id: "installed-travel",
      name: "Installed Trip Companion",
      installed: true
    });
    const newTravel = makeMarketplaceAgent({
      id: "new-travel",
      name: "New Trip Companion"
    });

    expect(score(newTravel, { category: "Travel", search: "travel", installed: false }).score)
      .toBeGreaterThan(score(installedTravel, { category: "Travel", search: "travel", installed: true }).score);
  });
});
