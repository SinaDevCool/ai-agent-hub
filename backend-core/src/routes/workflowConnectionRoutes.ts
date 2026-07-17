import { Router } from "express";
import { z } from "zod";
import { httpError } from "../errors/httpError.js";
import {
  createWorkflowConnection,
  deleteWorkflowConnection,
  getWorkflowConnectionForUser,
  listWorkflowCapabilities,
  listWorkflowConnections,
  testWorkflowConnection,
  updateWorkflowConnection
} from "../services/workflowConnectionService.js";

export const workflowConnectionRoutes = Router();

const workflowParams = z.object({ workflowId: z.string().min(1) });
const providerSchema = z.enum(["n8n", "make", "zapier", "custom"]).optional();
const statusSchema = z.enum(["draft", "active", "failed", "disabled"]).optional();

const createWorkflowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  provider: providerSchema,
  endpointUrl: z.string().trim().url().max(2000),
  agentId: z.string().min(1).nullable().optional(),
  toolName: z.string().trim().min(1).max(120).optional(),
  capabilityKey: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(280).optional()
});

const updateWorkflowSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  provider: providerSchema,
  endpointUrl: z.string().trim().url().max(2000).optional(),
  agentId: z.string().min(1).nullable().optional(),
  toolName: z.string().trim().min(1).max(120).optional(),
  capabilityKey: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(280).optional(),
  status: statusSchema
});

workflowConnectionRoutes.get("/capabilities", (_req, res) => {
  res.json({ capabilities: listWorkflowCapabilities() });
});

workflowConnectionRoutes.get("/", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  res.json({ workflows: await listWorkflowConnections(req.userId) });
});

workflowConnectionRoutes.post("/", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const input = createWorkflowSchema.parse(req.body);
  const result = await createWorkflowConnection({ userId: req.userId, ...input });
  res.status(201).json({
    ...result,
    setup: {
      signatureHeader: "X-Agent-Hub-Signature",
      timestampHeader: "X-Agent-Hub-Timestamp",
      workflowIdHeader: "X-Agent-Hub-Workflow-Id"
    }
  });
});

workflowConnectionRoutes.get("/:workflowId", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const { workflowId } = workflowParams.parse(req.params);
  const workflow = await getWorkflowConnectionForUser({ userId: req.userId, workflowId });
  if (!workflow) throw httpError(404, "Workflow not found.", "workflow_not_found");
  res.json({ workflow });
});

workflowConnectionRoutes.patch("/:workflowId", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const { workflowId } = workflowParams.parse(req.params);
  const input = updateWorkflowSchema.parse(req.body);
  const workflow = await updateWorkflowConnection({ userId: req.userId, workflowId, ...input });
  res.json({ workflow });
});

workflowConnectionRoutes.delete("/:workflowId", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const { workflowId } = workflowParams.parse(req.params);
  const deleted = await deleteWorkflowConnection({ userId: req.userId, workflowId });
  if (!deleted) throw httpError(404, "Workflow not found.", "workflow_not_found");
  res.json({ ok: true });
});

workflowConnectionRoutes.post("/:workflowId/test", async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: { message: "No user context" } });
  const { workflowId } = workflowParams.parse(req.params);
  res.json(await testWorkflowConnection({ userId: req.userId, workflowId }));
});
