import type { ToolAdapter } from "../toolExecutionTypes.js";

export const unsupportedAdapter: ToolAdapter = {
  type: "webhook",
  canHandle() {
    return true;
  },
  async execute(input) {
    if (input.definition.requiredConnector) {
      return {
        status: "blocked",
        reason: `${input.definition.requiredConnector} is not connected yet. Connect an account before this agent can use ${input.toolName}.`
      };
    }
    return {
      status: "blocked",
      reason: `${input.toolName} uses the ${input.definition.adapterType} adapter, but that adapter is not implemented yet.`
    };
  }
};
