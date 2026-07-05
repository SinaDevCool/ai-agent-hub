import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { reindexVault, searchVaultDocuments } from "../services/vaultIndexService.js";
import { serializeVaultDocument, serializeVaultSchema } from "../services/serializerService.js";
import { embedText } from "../services/embeddingService.js";
import { sha256 } from "../services/cryptoService.js";
import { decodeJson, encodeJson } from "../services/jsonService.js";
import { writeActivityLog } from "../services/activityLogService.js";

export const vaultRoutes = Router();

const createDocumentSchema = z.object({
  title: z.string().trim().min(2).max(120),
  vaultSchemaId: z.string().min(1).nullable().optional(),
  content: z.string().trim().min(10).max(5000)
});

const updateDocumentSchema = createDocumentSchema.partial().refine(
  (value) => Boolean(value.title || value.vaultSchemaId !== undefined || value.content),
  "At least one field must be updated"
);

function slugifyTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
  return slug || "vault-item";
}

vaultRoutes.get("/schemas", async (_req, res) => {
  const schemas = await prisma.vaultSchema.findMany({ orderBy: { name: "asc" } });
  res.json({ schemas: schemas.map(serializeVaultSchema) });
});

vaultRoutes.get("/documents", async (req, res) => {
  const documents = await prisma.vaultDocument.findMany({
    where: { userId: req.userId },
    include: { vaultSchema: true },
    orderBy: { indexedAt: "desc" }
  });
  res.json({ documents: documents.map(serializeVaultDocument) });
});

vaultRoutes.post("/documents", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const input = createDocumentSchema.parse(req.body);
  const schema = input.vaultSchemaId
    ? await prisma.vaultSchema.findUnique({ where: { id: input.vaultSchemaId } })
    : null;

  if (input.vaultSchemaId && !schema) {
    return res.status(400).json({ error: { message: "Unknown vault schema" } });
  }

  const frontmatter = {
    source: "manual-entry",
    schema: schema?.name ?? null,
    content: input.content
  };
  const textForEmbedding = `${input.title}\n${schema?.name ?? "Uncategorized"}\n${input.content}`;
  const embedding = await embedText(textForEmbedding);
  const contentHash = sha256(textForEmbedding);
  const relativePath = `manual/${slugifyTitle(input.title)}-${contentHash.slice(0, 10)}.md`;
  const excerpt = input.content.length > 240 ? `${input.content.slice(0, 237)}...` : input.content;

  const document = await prisma.vaultDocument.create({
    data: {
      userId: req.userId,
      vaultSchemaId: schema?.id ?? null,
      title: input.title,
      relativePath,
      contentHash,
      frontmatter: encodeJson(frontmatter),
      excerpt,
      vectorProvider: embedding.provider,
      embedding: encodeJson(embedding.vector)
    },
    include: { vaultSchema: true }
  });

  await writeActivityLog({
    userId: req.userId,
    actionType: "vault_write",
    status: "success",
    dataAccessed: document.relativePath,
    dynamicMetadata: {
      title: document.title,
      schema: schema?.name ?? null,
      source: "manual-entry"
    }
  });

  res.status(201).json({ document: serializeVaultDocument(document) });
});

vaultRoutes.put("/documents/:id", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const existing = await prisma.vaultDocument.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { vaultSchema: true }
  });
  if (!existing) return res.status(404).json({ error: { message: "Vault item not found" } });

  const input = updateDocumentSchema.parse(req.body);
  const schema = input.vaultSchemaId
    ? await prisma.vaultSchema.findUnique({ where: { id: input.vaultSchemaId } })
    : input.vaultSchemaId === null
      ? null
      : existing.vaultSchema;

  if (input.vaultSchemaId && !schema) {
    return res.status(400).json({ error: { message: "Unknown vault schema" } });
  }

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
  const excerpt = content.length > 240 ? `${content.slice(0, 237)}...` : content;

  const document = await prisma.vaultDocument.update({
    where: { id: existing.id },
    data: {
      title,
      vaultSchemaId: schema?.id ?? null,
      contentHash: sha256(textForEmbedding),
      frontmatter: encodeJson(frontmatter),
      excerpt,
      vectorProvider: embedding.provider,
      embedding: encodeJson(embedding.vector),
      indexedAt: new Date()
    },
    include: { vaultSchema: true }
  });

  await writeActivityLog({
    userId: req.userId,
    actionType: "vault_write",
    status: "success",
    dataAccessed: document.relativePath,
    dynamicMetadata: {
      title: document.title,
      schema: schema?.name ?? null,
      operation: "updated"
    }
  });

  res.json({ document: serializeVaultDocument(document) });
});

vaultRoutes.delete("/documents/:id", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const existing = await prisma.vaultDocument.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { vaultSchema: true }
  });
  if (!existing) return res.status(404).json({ error: { message: "Vault item not found" } });

  await prisma.vaultDocument.delete({ where: { id: existing.id } });
  await writeActivityLog({
    userId: req.userId,
    actionType: "vault_write",
    status: "success",
    dataAccessed: existing.relativePath,
    dynamicMetadata: {
      title: existing.title,
      schema: existing.vaultSchema?.name ?? null,
      operation: "deleted"
    }
  });

  res.json({ deleted: true });
});

vaultRoutes.post("/reindex", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const indexed = await reindexVault(req.userId);
  res.json({ indexedCount: indexed.length, indexed: indexed.map(serializeVaultDocument) });
});

vaultRoutes.get("/search", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const query = String(req.query.q ?? "");
  const schemaId = typeof req.query.schemaId === "string" && req.query.schemaId ? req.query.schemaId : undefined;
  const results = await searchVaultDocuments(req.userId, query, schemaId);
  res.json({ results: results.map(serializeVaultDocument) });
});
