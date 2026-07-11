import type { AgentCategory, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";
import { writeActivityLog } from "./activityLogService.js";
import { decodeJson } from "./jsonService.js";
import { serializeAgentDefinition, serializeUserAgentInstall } from "./serializerService.js";

type MarketplaceManifest = {
  protocol?: string;
  tools?: string[];
  requestedSchemas?: string[];
  highRiskActions?: string[];
  description?: string;
  examplePrompts?: string[];
  trustReasons?: string[];
};

type MarketplaceDefinition = Prisma.AgentDefinitionGetPayload<{
  include: {
    creator: true;
    versions: true;
    installs: true;
  };
}>;

type MarketplaceInstall = Prisma.UserAgentInstallGetPayload<{
  include: {
    agentDefinition: { include: { creator: true; versions: true } };
    agentVersion: true;
    agent: { include: { permissions: { include: { vaultSchema: true } }; connections: true } };
  };
}>;

type MarketplaceSearchResult = {
  definition: MarketplaceDefinition;
  matchScore: number;
  matchReasons: string[];
};

const publishedDefinitionInclude = (userId: string) => ({
  creator: true,
  versions: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" as const } },
  installs: { where: { userId }, take: 1 }
});

const installInclude = (userId: string) => ({
  agentDefinition: { include: { creator: true, versions: { where: { isActive: true }, take: 1 } } },
  agentVersion: true,
  agent: { include: { permissions: { where: { userId }, include: { vaultSchema: true } }, connections: { where: { userId } } } }
});

export function parseCapabilityManifest(value: string): MarketplaceManifest {
  const manifest = decodeJson<MarketplaceManifest>(value, {});
  return manifest && typeof manifest === "object" ? manifest : {};
}

function normalize(value: unknown) {
  return String(value ?? "").toLowerCase();
}

function listValues(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function addReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

const internalListingPatterns = [
  /\bqa\b/i,
  /\bsmoke\b/i,
  /\btest\b/i,
  /\bdemo\b/i,
  /review approve qa/i,
  /resubmit qa/i
];

const searchStopWords = new Set(["and", "for", "help", "with", "need", "the", "this", "that", "my", "me", "to", "a", "an", "i", "marketplace"]);

export function isInternalMarketplaceDefinition(definition: Pick<MarketplaceDefinition, "name" | "slug" | "tagline" | "description">) {
  const text = [definition.name, definition.slug, definition.tagline, definition.description].join(" ");
  return internalListingPatterns.some((pattern) => pattern.test(text));
}

function fieldScore(input: { search: string; tokens: string[]; values: string[]; weight: number }) {
  const normalizedValues = input.values.map(normalize).filter(Boolean);
  if (normalizedValues.length === 0) return 0;
  const exact = normalizedValues.some((value) => value === input.search);
  const phrase = normalizedValues.some((value) => value.includes(input.search));
  const tokenMatches = input.tokens.filter((token) => normalizedValues.some((value) => value.includes(token))).length;
  if (exact) return input.weight;
  if (phrase) return Math.round(input.weight * 3);
  if (tokenMatches > 0 && input.tokens.length > 0) return Math.round(input.weight * Math.min(0.25, tokenMatches / input.tokens.length));
  return 0;
}

export function scoreMarketplaceAgent(definition: MarketplaceDefinition, searchInput: string): MarketplaceSearchResult {
  const search = searchInput.trim().toLowerCase();
  const manifest = parseCapabilityManifest(definition.versions[0]?.capabilityManifest ?? "");
  const tokens = search.split(/[^a-z0-9]+/).filter((token) =>
    token.length > 1
    && !/^\d+$/.test(token)
    && !searchStopWords.has(token)
  );
  const reasons: string[] = [];

  if (!search) {
    return {
      definition,
      matchScore: 0,
      matchReasons: []
    };
  }

  let score = 0;
  const nameScore = fieldScore({ search, tokens, weight: 70, values: [definition.name] });
  if (nameScore) addReason(reasons, `Matches "${definition.name}"`);
  score += nameScore;

  const descriptionScore = fieldScore({
    search,
    tokens,
    weight: 42,
    values: [definition.tagline, definition.description, manifest.description ?? ""]
  });
  if (descriptionScore) addReason(reasons, "Matches what this helper does");
  score += descriptionScore;

  const categoryScore = fieldScore({ search, tokens, weight: 32, values: [definition.category] });
  if (categoryScore) addReason(reasons, `Matches ${definition.category.toLowerCase()} helpers`);
  score += categoryScore;

  const promptScore = fieldScore({ search, tokens, weight: 28, values: listValues(manifest.examplePrompts) });
  if (promptScore) addReason(reasons, "Matches example tasks people ask for");
  score += promptScore;

  const schemaScore = fieldScore({ search, tokens, weight: 24, values: listValues(manifest.requestedSchemas) });
  if (schemaScore) addReason(reasons, "Uses relevant private-info categories");
  score += schemaScore;

  const actionScore = fieldScore({
    search,
    tokens,
    weight: 18,
    values: [...listValues(manifest.tools), ...listValues(manifest.highRiskActions)]
  });
  if (actionScore) addReason(reasons, "Matches available helper actions");
  score += actionScore;

  const trustScore = fieldScore({ search, tokens, weight: 12, values: listValues(manifest.trustReasons) });
  if (trustScore) addReason(reasons, "Matches trust and safety details");
  score += trustScore;

  if (score > 0) {
    score += Math.min(4, Math.round(definition.trustScore / 30));
    score += Math.min(1, Math.round(definition.installCount / 5000));
  }

  return {
    definition,
    matchScore: score,
    matchReasons: reasons.slice(0, 4)
  };
}

function serializeScoredDefinition(result: MarketplaceSearchResult) {
  return {
    ...serializeAgentDefinition(result.definition),
    ...(result.matchScore > 0 ? { matchScore: result.matchScore, matchReasons: result.matchReasons } : {})
  };
}

export async function listMarketplaceAgents(input: { userId: string; category?: AgentCategory; search?: string }) {
  const definitions = await prisma.agentDefinition.findMany({
    where: {
      status: "published",
      ...(input.category ? { category: input.category } : {})
    },
    include: publishedDefinitionInclude(input.userId),
    orderBy: [{ installCount: "desc" }, { trustScore: "desc" }, { name: "asc" }]
  });

  const search = input.search?.trim() ?? "";
  const publicDefinitions = definitions.filter((definition) => !isInternalMarketplaceDefinition(definition));
  const scored = publicDefinitions.map((definition) => scoreMarketplaceAgent(definition, search));
  const visible = search ? scored.filter((result) => result.matchScore > 0) : scored;
  if (search) {
    visible.sort((left, right) =>
      right.matchScore - left.matchScore
      || right.definition.trustScore - left.definition.trustScore
      || right.definition.installCount - left.definition.installCount
      || left.definition.name.localeCompare(right.definition.name)
    );
  }

  return visible.map(serializeScoredDefinition);
}

export async function getMarketplaceAgentBySlug(input: { userId: string; slug: string }) {
  const definition = await prisma.agentDefinition.findFirst({
    where: { slug: input.slug, status: "published" },
    include: publishedDefinitionInclude(input.userId)
  });
  if (!definition || isInternalMarketplaceDefinition(definition)) return null;
  return serializeAgentDefinition(definition);
}

export async function resolveInstallAgentName(userId: string, requestedName: string) {
  const existingAgent = await prisma.agent.findFirst({
    where: { name: requestedName, connections: { some: { userId } } },
    select: { id: true }
  });
  if (!existingAgent) return requestedName;

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${requestedName} ${index}`;
    const conflict = await prisma.agent.findFirst({
      where: { name: candidate, connections: { some: { userId } } },
      select: { id: true }
    });
    if (!conflict) return candidate;
  }
  return `${requestedName} ${Date.now()}`;
}

export async function installMarketplaceAgent(input: { userId: string; agentDefinitionId: string; displayName?: string }) {
  const definition = await prisma.agentDefinition.findUnique({
    where: { id: input.agentDefinitionId },
    include: { versions: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" } } }
  });
  if (!definition || definition.status !== "published" || isInternalMarketplaceDefinition(definition)) {
    throw httpError(404, "This helper is not available right now.", "marketplace_agent_unavailable");
  }
  if (!definition.versions[0]) {
    throw httpError(409, "This helper does not have an active version to install.", "marketplace_agent_no_active_version");
  }

  const existingInstall = await prisma.userAgentInstall.findUnique({
    where: { userId_agentDefinitionId: { userId: input.userId, agentDefinitionId: definition.id } },
    include: installInclude(input.userId)
  });
  if (existingInstall) return { install: serializeUserAgentInstall(existingInstall), created: false };

  const version = definition.versions[0];
  const resolvedDisplayName = await resolveInstallAgentName(input.userId, input.displayName || definition.name);
  const created = await prisma.$transaction(async (tx) => {
    const agent = await tx.agent.create({
      data: {
        name: resolvedDisplayName,
        category: definition.category,
        apiProtocol: version.apiProtocol,
        trustScore: definition.trustScore,
        capabilityManifest: version.capabilityManifest
      }
    });

    await tx.userConnection.create({
      data: {
        userId: input.userId,
        agentId: agent.id,
        connectionStatus: "restricted",
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const install = await tx.userAgentInstall.create({
      data: {
        userId: input.userId,
        agentDefinitionId: definition.id,
        agentVersionId: version.id,
        agentId: agent.id,
        displayName: resolvedDisplayName,
        connectionStatus: "restricted"
      },
      include: installInclude(input.userId)
    }) as MarketplaceInstall;
    await tx.agentDefinition.update({ where: { id: definition.id }, data: { installCount: { increment: 1 } } });
    return install;
  });

  await writeActivityLog({
    userId: input.userId,
    agentId: created.agentId,
    actionType: "agent_created",
    status: "success",
    dataAccessed: created.displayName,
    dynamicMetadata: {
      source: "marketplace_install",
      marketplaceAgentId: definition.id,
      marketplaceAgentSlug: definition.slug
    }
  });

  return { install: serializeUserAgentInstall(created), created: true };
}
