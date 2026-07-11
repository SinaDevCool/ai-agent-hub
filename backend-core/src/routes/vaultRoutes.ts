import { Router } from "express";
import { z } from "zod";
import { unauthorized } from "../errors/httpError.js";
import {
  createVaultDocument,
  deleteVaultDocument,
  listVaultDocuments,
  listVaultSchemas,
  reindexVaultDocuments,
  searchVaultDocumentsForUser,
  updateVaultDocument
} from "../services/vaultDocumentService.js";

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

function requireUserId(userId?: string) {
  if (!userId) throw unauthorized("No user context", "missing_user_context");
  return userId;
}

vaultRoutes.get("/schemas", async (_req, res) => {
  res.json({ schemas: await listVaultSchemas() });
});

vaultRoutes.get("/documents", async (req, res) => {
  res.json({ documents: await listVaultDocuments(requireUserId(req.userId)) });
});

vaultRoutes.post("/documents", async (req, res) => {
  const input = createDocumentSchema.parse(req.body);
  const document = await createVaultDocument(requireUserId(req.userId), input);
  res.status(201).json({ document });
});

vaultRoutes.put("/documents/:id", async (req, res) => {
  const input = updateDocumentSchema.parse(req.body);
  const document = await updateVaultDocument(requireUserId(req.userId), req.params.id, input);
  res.json({ document });
});

vaultRoutes.delete("/documents/:id", async (req, res) => {
  res.json(await deleteVaultDocument(requireUserId(req.userId), req.params.id));
});

vaultRoutes.post("/reindex", async (req, res) => {
  res.json(await reindexVaultDocuments(requireUserId(req.userId)));
});

vaultRoutes.get("/search", async (req, res) => {
  const query = String(req.query.q ?? "");
  const schemaId = typeof req.query.schemaId === "string" && req.query.schemaId ? req.query.schemaId : undefined;
  const results = await searchVaultDocumentsForUser(requireUserId(req.userId), query, schemaId);
  res.json({ results });
});
