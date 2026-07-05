import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { reindexVault, searchVaultDocuments } from "../services/vaultIndexService.js";
import { serializeVaultDocument, serializeVaultSchema } from "../services/serializerService.js";

export const vaultRoutes = Router();

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
