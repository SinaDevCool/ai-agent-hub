import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { reindexVault, searchVaultDocuments } from "../services/vaultIndexService.js";
import { serializeVaultDocument, serializeVaultSchema } from "../services/serializerService.js";
import { embedText } from "../services/embeddingService.js";
import { sha256 } from "../services/cryptoService.js";
import { encodeJson } from "../services/jsonService.js";
import { writeActivityLog } from "../services/activityLogService.js";

export const vaultRoutes = Router();

const createDocumentSchema = z.object({
  title: z.string().trim().min(2).max(120),
  vaultSchemaId: z.string().min(1).nullable().optional(),
  content: z.string().trim().min(10).max(5000)
});

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

vaultRoutes.post("/reindex", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const indexed = await reindexVault(req.userId);
  res.json({ indexedCount: indexed.length, indexed: indexed.map(serializeVaultDocument) });
});

vaultRoutes.get("/search", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const query = String(req.query.q ?? "");
  const results = await searchVaultDocuments(req.userId, query);
  res.json({ results: results.map(serializeVaultDocument) });
});
