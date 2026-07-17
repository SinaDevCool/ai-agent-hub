import type { ApiProtocol, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { httpError } from "../errors/httpError.js";
import {
  buildLegacyCapabilityManifest,
  defaultHighRiskActionsForSource,
  defaultToolsForSource,
  protocolForLegacySource
} from "./agentImportManifestService.js";
import { reviewAgentImportManifest } from "./agentImportSafetyReviewService.js";
import { attachRuntimeBindingToManifest, bindAgentRuntime } from "./agentRuntimeBindingService.js";
import { sha256 } from "./cryptoService.js";
import { validateExternalRuntimeUrl } from "./externalRuntimeProxyService.js";
import { encodeJson } from "./jsonService.js";
import { resolveInstallAgentName } from "./marketplaceService.js";
import { serializeUserAgentInstall } from "./serializerService.js";
import { writeActivityLog } from "./activityLogService.js";

const sourceTypeSchema = z.enum(["mcp_server", "openapi_endpoint"]);
const categorySchema = z.enum(["Financial", "Executive", "Wellness", "Domestic", "Legal", "Travel", "Maintenance", "Custom"]);

const externalImportSchema = z.object({
  sourceType: sourceTypeSchema,
  endpointUrl: z.string().trim().min(8).max(500),
  displayName: z.string().trim().min(2).max(100).optional(),
  category: categorySchema.default("Custom")
});

type ExternalImportInput = z.input<typeof externalImportSchema>;
type ExternalImportSourceType = z.output<typeof sourceTypeSchema>;

type ExternalInstall = Prisma.UserAgentInstallGetPayload<{
  include: {
    agentDefinition: { include: { creator: true; versions: { where: { isActive: true }; take: 1; orderBy: { createdAt: "desc" } } } };
    agentVersion: true;
    agent: { include: { permissions: { include: { vaultSchema: true } }; connections: true } };
  };
}>;

const importInstallInclude = (userId: string) => ({
  agentDefinition: { include: { creator: true, versions: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" as const } } } },
  agentVersion: true,
  agent: { include: { permissions: { where: { userId }, include: { vaultSchema: true } }, connections: { where: { userId } } } }
});

function parseImportInput(input: unknown) {
  const parsed = externalImportSchema.safeParse(input);
  if (!parsed.success) {
    throw httpError(400, "Check the external helper details and try again.", "validation_error");
  }
  return parsed.data;
}

function sourceLabel(sourceType: ExternalImportSourceType) {
  return sourceType === "mcp_server" ? "External MCP helper" : "External OpenAPI helper";
}

function protocolForSource(sourceType: ExternalImportSourceType): ApiProtocol {
  return protocolForLegacySource(sourceType);
}

function defaultTools(sourceType: ExternalImportSourceType) {
  return defaultToolsForSource(sourceType);
}

function defaultHighRiskActions(sourceType: ExternalImportSourceType) {
  return defaultHighRiskActionsForSource(sourceType);
}

function titleFromHost(host: string) {
  return host
    .replace(/^www\./, "")
    .split(".")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function importSlug(sourceType: ExternalImportSourceType, endpointUrl: string) {
  const hash = sha256(`${sourceType}:${endpointUrl.trim().toLowerCase()}`).slice(0, 12);
  return `external-import-${sourceType.replace("_", "-")}-${hash}`;
}

function buildPreview(input: z.output<typeof externalImportSchema>) {
  const urlDecision = validateExternalRuntimeUrl(input.endpointUrl);
  if (!urlDecision.allowed) {
    const capabilityManifest = buildLegacyCapabilityManifest({
      sourceType: input.sourceType,
      name: input.displayName?.trim() || "External helper",
      description: "This external helper could not pass the endpoint safety check.",
      category: input.category,
      endpointUrl: input.endpointUrl,
      tools: defaultTools(input.sourceType),
      highRiskActions: defaultHighRiskActions(input.sourceType),
      verificationStatus: "blocked",
      verificationSummary: [urlDecision.reason],
      examplePrompts: ["Try again with a public HTTPS endpoint."],
      trustReasons: ["AI Agent Hub blocks unsafe local, private-network, and non-HTTPS endpoints."]
    });
    const safetyReview = reviewAgentImportManifest(capabilityManifest.normalizedImportManifest);
    const runtimeBinding = bindAgentRuntime({ manifest: capabilityManifest.normalizedImportManifest, safetyReview });
    capabilityManifest.normalizedImportManifest = attachRuntimeBindingToManifest({
      manifest: capabilityManifest.normalizedImportManifest,
      runtimeBinding
    });
    return {
      sourceType: input.sourceType,
      sourceLabel: sourceLabel(input.sourceType),
      endpointHost: "",
      displayName: input.displayName?.trim() || "External helper",
      category: input.category,
      protocol: protocolForSource(input.sourceType),
      verificationStatus: "blocked" as const,
      canInstall: false,
      blockers: uniqueStrings([urlDecision.reason, ...runtimeBinding.blockers]),
      warnings: [],
      capabilityManifest,
      safetyReview,
      runtimeBinding
    };
  }

  const host = urlDecision.url.hostname.toLowerCase();
  const displayName = input.displayName?.trim() || `${titleFromHost(host)} Helper`;
  const highRiskActions = defaultHighRiskActions(input.sourceType);
  const description = `Personal external helper imported from ${host}. AI Agent Hub keeps it restricted and routes requests through the safety proxy.`;
  const verificationSummary = [
    "Endpoint passed AI Agent Hub's URL safety review for a personal import.",
    "The full endpoint path is hidden from normal receipts; the host remains visible."
  ];
  const capabilityManifest = buildLegacyCapabilityManifest({
    sourceType: input.sourceType,
    name: displayName,
    description,
    category: input.category,
    endpointUrl: urlDecision.url.toString(),
    tools: defaultTools(input.sourceType),
    highRiskActions,
    verificationStatus: "verified",
    verificationSummary,
    examplePrompts: [`Ask ${displayName} what it can help with.`],
    trustReasons: [
      "Runs through AI Agent Hub's external safety proxy.",
      "Starts restricted until you approve any private info or sensitive action."
    ]
  });
  const safetyReview = reviewAgentImportManifest(capabilityManifest.normalizedImportManifest);
  const runtimeBinding = bindAgentRuntime({ manifest: capabilityManifest.normalizedImportManifest, safetyReview });
  capabilityManifest.normalizedImportManifest = attachRuntimeBindingToManifest({
    manifest: capabilityManifest.normalizedImportManifest,
    runtimeBinding
  });

  return {
    sourceType: input.sourceType,
    sourceLabel: sourceLabel(input.sourceType),
    endpointHost: host,
    displayName,
    category: input.category,
    protocol: protocolForSource(input.sourceType),
    verificationStatus: "verified" as const,
    canInstall: safetyReview.status !== "blocked" && runtimeBinding.status !== "blocked",
    blockers: uniqueStrings([...safetyReview.blockers, ...runtimeBinding.blockers]),
    warnings: uniqueStrings([
      ...(highRiskActions.length ? ["This helper may prepare outside actions. AI Agent Hub will ask before anything sensitive continues."] : []),
      ...safetyReview.warnings
    ]),
    capabilityManifest,
    safetyReview,
    runtimeBinding
  };
}

export async function previewExternalAgentImport(input: ExternalImportInput) {
  return buildPreview(parseImportInput(input));
}

async function findOrCreateExternalDefinition(preview: ReturnType<typeof buildPreview>) {
  if (!preview.canInstall || !preview.capabilityManifest.externalEndpointUrl) {
    throw httpError(400, preview.blockers[0] || "This external helper cannot be imported.", "external_import_blocked");
  }

  const slug = importSlug(preview.sourceType, preview.capabilityManifest.externalEndpointUrl);
  const existing = await prisma.agentDefinition.findUnique({
    where: { slug },
    include: { versions: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" } } }
  });
  if (existing?.versions[0]) return { definition: existing, version: existing.versions[0] };

  const definition = await prisma.agentDefinition.create({
    data: {
      slug,
      name: preview.displayName,
      tagline: `Personal import from ${preview.endpointHost}`,
      description: preview.capabilityManifest.description,
      category: preview.category,
      status: "archived",
      trustScore: 65,
      averageRating: 0,
      versions: {
        create: {
          version: "1.0.0",
          apiProtocol: preview.protocol,
          capabilityManifest: encodeJson(preview.capabilityManifest),
          releaseNotes: "Personal external helper import.",
          isActive: true
        }
      }
    },
    include: { versions: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" } } }
  });
  return { definition, version: definition.versions[0] };
}

export async function importExternalAgentForUser(input: { userId: string; body: ExternalImportInput }) {
  const parsed = parseImportInput(input.body);
  const preview = buildPreview(parsed);
  const { definition, version } = await findOrCreateExternalDefinition(preview);
  if (!version) {
    throw httpError(409, "This external helper does not have an active import version.", "external_import_no_active_version");
  }

  const existingInstall = await prisma.userAgentInstall.findUnique({
    where: { userId_agentDefinitionId: { userId: input.userId, agentDefinitionId: definition.id } },
    include: importInstallInclude(input.userId)
  });
  if (existingInstall) return { install: serializeUserAgentInstall(existingInstall), created: false, preview };

  const displayName = await resolveInstallAgentName(input.userId, preview.displayName);
  const created = await prisma.$transaction(async (tx) => {
    const agent = await tx.agent.create({
      data: {
        name: displayName,
        category: preview.category,
        apiProtocol: version.apiProtocol,
        trustScore: 65,
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

    return tx.userAgentInstall.create({
      data: {
        userId: input.userId,
        agentDefinitionId: definition.id,
        agentVersionId: version.id,
        agentId: agent.id,
        displayName,
        connectionStatus: "restricted"
      },
      include: importInstallInclude(input.userId)
    }) as Promise<ExternalInstall>;
  });

  await writeActivityLog({
    userId: input.userId,
    agentId: created.agentId,
    actionType: "agent_created",
    status: "success",
    dataAccessed: created.displayName,
    dynamicMetadata: {
      source: "external_agent_import",
      sourceType: preview.sourceType,
      endpointHost: preview.endpointHost,
      proxyStatus: "prepared"
    }
  });

  return { install: serializeUserAgentInstall(created), created: true, preview };
}
