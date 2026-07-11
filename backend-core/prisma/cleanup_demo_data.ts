import { PrismaClient } from "@prisma/client";
import {
  isDemoAgentName,
  isDemoDocumentTitle,
  isDemoMarketplaceSlug,
  isDemoVaultSchemaName,
  schemaBlockReason
} from "../src/services/demoDataCleanupRules.js";

const prisma = new PrismaClient();

const args = new Set(process.argv.slice(2));
const shouldConfirm = args.has("--confirm");

type Candidate = {
  id: string;
  label: string;
};

type SchemaCandidate = Candidate & {
  documentIds: string[];
  permissionIds: string[];
};

type BlockedCandidate = Candidate & {
  reason: string;
};

function sampleLabels(candidates: Candidate[]) {
  return candidates.slice(0, 5).map((candidate) => candidate.label);
}

function printPreview(label: string, candidates: Candidate[]) {
  console.log(`- ${label}: ${candidates.length}`);
  const samples = sampleLabels(candidates);
  if (samples.length) console.log(`  sample: ${samples.join(" | ")}`);
}

async function findAgentCandidates() {
  const agents = await prisma.agent.findMany({ select: { id: true, name: true } });
  return agents
    .filter((agent) => isDemoAgentName(agent.name))
    .map((agent) => ({ id: agent.id, label: agent.name }));
}

async function findDefinitionCandidates() {
  const definitions = await prisma.agentDefinition.findMany({ select: { id: true, name: true, slug: true } });
  return definitions
    .filter((definition) =>
      isDemoAgentName(definition.name)
      || isDemoMarketplaceSlug(definition.slug)
    )
    .map((definition) => ({ id: definition.id, label: `${definition.name} (${definition.slug})` }));
}

async function findDocumentCandidates() {
  const documents = await prisma.vaultDocument.findMany({ select: { id: true, title: true } });
  return documents
    .filter((document) => isDemoDocumentTitle(document.title))
    .map((document) => ({ id: document.id, label: document.title }));
}

async function findSchemaCandidates() {
  const schemas = await prisma.vaultSchema.findMany({
    include: {
      documents: { select: { id: true, title: true } },
      permissions: { select: { id: true, userId: true, agent: { select: { name: true } } } }
    }
  });

  const safe: SchemaCandidate[] = [];
  const blocked: BlockedCandidate[] = [];

  for (const schema of schemas) {
    if (!isDemoVaultSchemaName(schema.name)) continue;

    const reason = schemaBlockReason({
      documentTitles: schema.documents.map((document) => document.title),
      permissionRefs: schema.permissions.map((permission) => ({
        userId: permission.userId,
        agentName: permission.agent.name
      }))
    });

    if (reason) {
      blocked.push({ id: schema.id, label: schema.name, reason });
      continue;
    }

    safe.push({
      id: schema.id,
      label: schema.name,
      documentIds: schema.documents.map((document) => document.id),
      permissionIds: schema.permissions.map((permission) => permission.id)
    });
  }

  return { safe, blocked };
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function printBlockedPreview(label: string, candidates: BlockedCandidate[]) {
  console.log(`- ${label}: ${candidates.length}`);
  const samples = candidates.slice(0, 5).map((candidate) => `${candidate.label} (${candidate.reason})`);
  if (samples.length) console.log(`  sample: ${samples.join(" | ")}`);
}

async function main() {
  const [agents, definitions, documents, schemas] = await Promise.all([
    findAgentCandidates(),
    findDefinitionCandidates(),
    findDocumentCandidates(),
    findSchemaCandidates()
  ]);

  console.log("Demo/test cleanup preview:");
  printPreview("Agents", agents);
  printPreview("Marketplace definitions", definitions);
  printPreview("Vault documents", documents);
  printPreview("Vault schemas", schemas.safe);
  printBlockedPreview("Blocked vault schemas", schemas.blocked);

  if (!shouldConfirm) {
    console.log("Dry run only. Re-run with --confirm to delete these exact previewed records.");
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const permissionIds = unique(schemas.safe.flatMap((schema) => schema.permissionIds));
    const documentIds = unique([
      ...documents.map((document) => document.id),
      ...schemas.safe.flatMap((schema) => schema.documentIds)
    ]);
    const deletedPermissions = await tx.agentPermission.deleteMany({ where: { id: { in: permissionIds } } });
    const deletedDocuments = await tx.vaultDocument.deleteMany({ where: { id: { in: documentIds } } });
    const deletedAgents = await tx.agent.deleteMany({ where: { id: { in: agents.map((agent) => agent.id) } } });
    const deletedDefinitions = await tx.agentDefinition.deleteMany({ where: { id: { in: definitions.map((definition) => definition.id) } } });
    const deletedSchemas = await tx.vaultSchema.deleteMany({ where: { id: { in: schemas.safe.map((schema) => schema.id) } } });
    return { deletedPermissions, deletedDocuments, deletedAgents, deletedDefinitions, deletedSchemas };
  });

  console.log("Deleted demo/test records:");
  console.log(`- Agents: ${result.deletedAgents.count}`);
  console.log(`- Marketplace definitions: ${result.deletedDefinitions.count}`);
  console.log(`- Vault documents: ${result.deletedDocuments.count}`);
  console.log(`- Vault schemas: ${result.deletedSchemas.count}`);
  console.log(`- Agent permissions: ${result.deletedPermissions.count}`);
  if (schemas.blocked.length) console.log(`Skipped ${schemas.blocked.length} matching vault schemas with non-demo references.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
