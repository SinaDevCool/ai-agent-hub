import { executeTool } from "./toolExecutionService.js";

export async function handleToolCall(input: {
  userId: string;
  agentId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}) {
  return executeTool(input);
}
