import { prisma } from "../db/prisma.js";
import { badRequest, notFound } from "../errors/httpError.js";
import { writeActivityLog } from "./activityLogService.js";
import { sha256 } from "./cryptoService.js";
import { embedText } from "./embeddingService.js";
import { decodeJson, encodeJson } from "./jsonService.js";
import { serializeVaultDocument, serializeVaultSchema } from "./serializerService.js";
import { reindexVault, searchVaultDocuments } from "./vaultIndexService.js";

export type CreateVaultDocumentInput = {
  title: string;
  vaultSchemaId?: string | null;
  content: string;
};

export type UpdateVaultDocumentInput = Partial<CreateVaultDocumentInput>;

function slugifyTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
  return slug || "vault-item";
}

function createExcerpt(content: string) {
  return content.length > 240 ? `${content.slice(0, 237)}...` : content;
}

async function findSchema(vaultSchemaId?: string | null) {
  if (!vaultSchemaId) return null;
  const schema = await prisma.vaultSchema.findUnique({ where: { id: vaultSchemaId } });
  if (!schema) throw badRequest("Unknown vault schema", "unknown_vault_schema");
  return schema;
}

export async function listVaultSchemas() {
  const schemas = await prisma.vaultSchema.findMany({ orderBy: { name: "asc" } });
  return schemas.map(serializeVaultSchema);
}

export async function listVaultDocuments(userId: string) {
  const documents = await prisma.vaultDocument.findMany({
    where: { userId },
    include: { vaultSchema: true },
    orderBy: { indexedAt: "desc" }
  });
  return documents.map(serializeVaultDocument);
}

export async function createVaultDocument(userId: string, input: CreateVaultDocumentInput) {
  const schema = await findSchema(input.vaultSchemaId);
  const frontmatter = {
    source: "manual-entry",
    schema: schema?.name ?? null,
    content: input.content
  };
  const textForEmbedding = `${input.title}\n${schema?.name ?? "Uncategorized"}\n${input.content}`;
  const embedding = await embedText(textForEmbedding);
  const contentHash = sha256(textForEmbedding);
  const relativePath = `manual/${slugifyTitle(input.title)}-${contentHash.slice(0, 10)}.md`;

  const document = await prisma.vaultDocument.create({
    data: {
      userId,
      vaultSchemaId: schema?.id ?? null,
      title: input.title,
      relativePath,
      contentHash,
      frontmatter: encodeJson(frontmatter),
      excerpt: createExcerpt(input.content),
      vectorProvider: embedding.provider,
      embedding: encodeJson(embedding.vector)
    },
    include: { vaultSchema: true }
  });

  await writeActivityLog({
    userId,
    actionType: "vault_write",
    status: "success",
    dataAccessed: document.relativePath,
    dynamicMetadata: {
      title: document.title,
      schema: schema?.name ?? null,
      source: "manual-entry"
    }
  });

  return serializeVaultDocument(document);
}

export async function updateVaultDocument(userId: string, documentId: string, input: UpdateVaultDocumentInput) {
  const existing = await prisma.vaultDocument.findFirst({
    where: { id: documentId, userId },
    include: { vaultSchema: true }
  });
  if (!existing) throw notFound("Vault item not found", "vault_item_not_found");

  const schema = input.vaultSchemaId === undefined ? existing.vaultSchema : await findSchema(input.vaultSchemaId);
  const title = input.title ?? existing.title;
  const existingFrontmatter = decodeJson<Record<string, unknown>>(existing.frontmatter, {});
  const content = input.content ?? String(existingFrontmatter.content ?? existing.excerpt);
  const frontmatter = {
    source: "manual-entry",
    schema: schema?.name ?? null,
    content
  };
  const textForEmbedding = `${title}\n${schema?.name ?? "Uncategorized"}\n${content}`;
  const embedding = await embedText(textForEmbedding);

  const document = await prisma.vaultDocument.update({
    where: { id: existing.id },
    data: {
      title,
      vaultSchemaId: schema?.id ?? null,
      contentHash: sha256(textForEmbedding),
      frontmatter: encodeJson(frontmatter),
      excerpt: createExcerpt(content),
      vectorProvider: embedding.provider,
      embedding: encodeJson(embedding.vector),
      indexedAt: new Date()
    },
    include: { vaultSchema: true }
  });

  await writeActivityLog({
    userId,
    actionType: "vault_write",
    status: "success",
    dataAccessed: document.relativePath,
    dynamicMetadata: {
      title: document.title,
      schema: schema?.name ?? null,
      operation: "updated"
    }
  });

  return serializeVaultDocument(document);
}

export async function deleteVaultDocument(userId: string, documentId: string) {
  const existing = await prisma.vaultDocument.findFirst({
    where: { id: documentId, userId },
    include: { vaultSchema: true }
  });
  if (!existing) throw notFound("Vault item not found", "vault_item_not_found");

  await prisma.vaultDocument.delete({ where: { id: existing.id } });
  await writeActivityLog({
    userId,
    actionType: "vault_write",
    status: "success",
    dataAccessed: existing.relativePath,
    dynamicMetadata: {
      title: existing.title,
      schema: existing.vaultSchema?.name ?? null,
      operation: "deleted"
    }
  });

  return { deleted: true };
}

export async function reindexVaultDocuments(userId: string) {
  const indexed = await reindexVault(userId);
  return { indexedCount: indexed.length, indexed: indexed.map(serializeVaultDocument) };
}

export async function searchVaultDocumentsForUser(userId: string, query: string, schemaId?: string) {
  const results = await searchVaultDocuments(userId, query, schemaId);
  return results.map(serializeVaultDocument);
}
