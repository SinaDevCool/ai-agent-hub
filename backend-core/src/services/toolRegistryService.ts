import type { PermissionType, RiskLevel } from "@prisma/client";

export type ToolCategory = "vault" | "action" | "travel" | "email" | "calendar" | "jobs" | "finance" | "health";
export type ToolAdapterType = "native" | "oauth_api" | "webhook" | "mcp" | "openapi";

export type ToolDefinition = {
  name: string;
  description: string;
  category: ToolCategory;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  adapterType: ToolAdapterType;
  adapterConfig?: Record<string, unknown>;
  requiredPermission?: PermissionType;
  requiredConnector?: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
};

const textProperty = { type: "string" };

export const toolRegistry: ToolDefinition[] = [
  {
    name: "vault.search",
    description: "Search only the private info categories this agent is allowed to read.",
    category: "vault",
    riskLevel: "low",
    requiresApproval: false,
    adapterType: "native",
    requiredPermission: "read",
    inputSchema: {
      type: "object",
      properties: { query: textProperty, schema: textProperty },
      required: ["query"]
    },
    outputSchema: { type: "object", properties: { documents: { type: "array" } } }
  },
  {
    name: "action.execute",
    description: "Execute a local agent action after policy and approval checks.",
    category: "action",
    riskLevel: "high",
    requiresApproval: true,
    adapterType: "native",
    requiredPermission: "execute_action",
    inputSchema: {
      type: "object",
      properties: { actionName: textProperty },
      required: ["actionName"]
    },
    outputSchema: { type: "object", properties: { actionName: textProperty, requestId: textProperty } }
  },
  {
    name: "workflow.run",
    description: "Run a configured external workflow through a verified webhook adapter.",
    category: "action",
    riskLevel: "medium",
    requiresApproval: false,
    adapterType: "webhook",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  },
  {
    name: "travel.search_hotels",
    description: "Search hotels through a connected travel provider.",
    category: "travel",
    riskLevel: "medium",
    requiresApproval: false,
    adapterType: "webhook",
    requiredConnector: "travel",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  },
  {
    name: "travel.search_flights",
    description: "Search flights through a connected travel provider.",
    category: "travel",
    riskLevel: "medium",
    requiresApproval: false,
    adapterType: "webhook",
    requiredConnector: "travel",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  },
  {
    name: "travel.prepare_booking",
    description: "Prepare a booking confirmation for user approval.",
    category: "travel",
    riskLevel: "high",
    requiresApproval: true,
    adapterType: "webhook",
    requiredConnector: "travel",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  },
  {
    name: "email.search",
    description: "Search connected email after the user grants account access.",
    category: "email",
    riskLevel: "medium",
    requiresApproval: false,
    adapterType: "oauth_api",
    adapterConfig: { provider: "office" },
    requiredConnector: "office",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  },
  {
    name: "email.draft_reply",
    description: "Draft an email reply without sending it.",
    category: "email",
    riskLevel: "medium",
    requiresApproval: false,
    adapterType: "oauth_api",
    adapterConfig: { provider: "office" },
    requiredConnector: "office",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  },
  {
    name: "email.send",
    description: "Send a prepared email after explicit approval.",
    category: "email",
    riskLevel: "high",
    requiresApproval: true,
    adapterType: "oauth_api",
    adapterConfig: { provider: "office" },
    requiredConnector: "office",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  },
  {
    name: "calendar.find_free_time",
    description: "Find free time in a connected calendar.",
    category: "calendar",
    riskLevel: "medium",
    requiresApproval: false,
    adapterType: "oauth_api",
    adapterConfig: { provider: "office" },
    requiredConnector: "office",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  },
  {
    name: "calendar.create_event",
    description: "Create a calendar event after explicit approval.",
    category: "calendar",
    riskLevel: "high",
    requiresApproval: true,
    adapterType: "oauth_api",
    adapterConfig: { provider: "office" },
    requiredConnector: "office",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  },
  {
    name: "drive.search",
    description: "Search Google Drive file metadata after the user connects Google.",
    category: "email",
    riskLevel: "medium",
    requiresApproval: false,
    adapterType: "oauth_api",
    adapterConfig: { provider: "office" },
    requiredConnector: "office",
    inputSchema: { type: "object", properties: { query: textProperty }, required: ["query"] },
    outputSchema: { type: "object", properties: { files: { type: "array" } } }
  },
  {
    name: "jobs.prepare_application",
    description: "Prepare a job application package without submitting it.",
    category: "jobs",
    riskLevel: "medium",
    requiresApproval: false,
    adapterType: "native",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  },
  {
    name: "jobs.submit_application",
    description: "Submit a job application after explicit approval.",
    category: "jobs",
    riskLevel: "high",
    requiresApproval: true,
    adapterType: "webhook",
    requiredConnector: "jobs",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  },
  {
    name: "finance.categorize_spending",
    description: "Categorize imported financial records without moving money.",
    category: "finance",
    riskLevel: "medium",
    requiresApproval: false,
    adapterType: "native",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  },
  {
    name: "health.summarize_notes",
    description: "Summarize health notes the agent is allowed to read.",
    category: "health",
    riskLevel: "medium",
    requiresApproval: false,
    adapterType: "native",
    requiredPermission: "read",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" }
  }
];

export function getToolDefinition(toolName: string) {
  return toolRegistry.find((tool) => tool.name === toolName);
}

export function listToolDefinitions() {
  return toolRegistry;
}
