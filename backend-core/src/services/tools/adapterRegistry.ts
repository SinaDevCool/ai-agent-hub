import type { ToolDefinition } from "../toolRegistryService.js";
import { googleAdapter } from "./adapters/googleAdapter.js";
import { nativeAdapter } from "./adapters/nativeAdapter.js";
import { unsupportedAdapter } from "./adapters/unsupportedAdapter.js";
import { webhookAdapter } from "./adapters/webhookAdapter.js";
import type { ToolAdapter } from "./toolExecutionTypes.js";

const adapters: ToolAdapter[] = [
  nativeAdapter,
  googleAdapter,
  webhookAdapter,
  unsupportedAdapter
];

export function getAdapterForTool(definition: ToolDefinition) {
  return adapters.find((adapter) => adapter.canHandle(definition)) ?? unsupportedAdapter;
}

export function listToolAdapters() {
  return adapters.map((adapter) => adapter.type);
}
