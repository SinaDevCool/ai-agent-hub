import { z } from "zod";

export const capabilityManifestSchema = z.object({
  protocol: z.enum(["MCP", "OpenAPI"]),
  sourceType: z.enum(["native", "mcp_server", "openapi_endpoint"]).default("native"),
  externalEndpointUrl: z.string().trim().url().max(500).optional(),
  verificationStatus: z.enum(["declared", "verified", "blocked"]).default("declared"),
  verificationSummary: z.array(z.string().trim().min(4).max(160)).max(8).default([]),
  tools: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  requestedSchemas: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  highRiskActions: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  description: z.string().trim().min(20).max(700),
  examplePrompts: z.array(z.string().trim().min(8).max(160)).min(1).max(8),
  trustReasons: z.array(z.string().trim().min(8).max(160)).min(1).max(8)
}).superRefine((manifest, ctx) => {
  const isExternal = manifest.sourceType !== "native";
  if (isExternal && !manifest.externalEndpointUrl) {
    ctx.addIssue({
      code: "custom",
      message: "External helpers need an endpoint or specification URL.",
      path: ["externalEndpointUrl"]
    });
  }
  if (manifest.sourceType === "mcp_server" && manifest.protocol !== "MCP") {
    ctx.addIssue({
      code: "custom",
      message: "MCP server imports must use the MCP protocol.",
      path: ["protocol"]
    });
  }
  if (manifest.sourceType === "openapi_endpoint" && manifest.protocol !== "OpenAPI") {
    ctx.addIssue({
      code: "custom",
      message: "OpenAPI imports must use the OpenAPI protocol.",
      path: ["protocol"]
    });
  }
});

export const agentDraftSchema = z.object({
  name: z.string().trim().min(2).max(100),
  tagline: z.string().trim().min(8).max(180),
  description: z.string().trim().min(20).max(1000),
  category: z.enum(["Financial", "Executive", "Wellness", "Domestic", "Legal", "Travel", "Maintenance", "Custom"]),
  apiProtocol: z.enum(["MCP", "OpenAPI"]).default("MCP"),
  capabilityManifest: capabilityManifestSchema,
  releaseNotes: z.string().trim().max(500).default("")
});

export type CreatorAgentDraftInput = z.input<typeof agentDraftSchema>;
export type CapabilityManifest = z.output<typeof capabilityManifestSchema>;
