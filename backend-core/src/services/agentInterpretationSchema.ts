import { z } from "zod";

export const runtimeIntentSchema = z.enum([
  "search",
  "action",
  "workflow",
  "email_search",
  "email_draft",
  "calendar_free_time",
  "document_search",
  "blocked"
]);

export const interpretationResultSchema = z.object({
  intent: runtimeIntentSchema,
  proposedTool: z.string().trim().min(1).max(160).regex(/^[a-z0-9][a-z0-9._:-]*$/i).nullable(),
  arguments: z.record(z.unknown()).default({}),
  missingFields: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  requiresClarification: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
  language: z.string().trim().min(2).max(35).default("und"),
  riskHints: z.array(z.string().trim().min(1).max(120)).max(20).default([])
}).strict();

export const clientRuntimeProvenanceSchema = z.object({
  kind: z.enum(["desktop-local", "browser-local", "rules", "cloud"]),
  modelId: z.string().trim().min(1).max(160),
  modelVersion: z.string().trim().min(1).max(80),
  quantization: z.string().trim().min(1).max(40).optional(),
  rulesVersion: z.string().trim().min(1).max(80)
}).strict();

export const runAgentPlanSchema = z.object({
  interpretation: interpretationResultSchema,
  displayText: z.string().trim().min(1).max(1200).optional(),
  clientRuntime: clientRuntimeProvenanceSchema
}).strict();

export type InterpretationResult = z.infer<typeof interpretationResultSchema>;
export type ClientRuntimeProvenance = z.infer<typeof clientRuntimeProvenanceSchema>;

