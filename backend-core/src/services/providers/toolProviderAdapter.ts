import type { ConnectorProviderDefinition } from "../connectorProviderRegistryService.js";
import type { ProviderAdapter, ProviderExecutionInput } from "./providerAdapterTypes.js";
import { normalizeProviderManifest } from "./providerManifestService.js";
import { executeProviderRuntime } from "./providerRuntimeAdapterService.js";

export function createToolProviderAdapter(definition: ConnectorProviderDefinition): ProviderAdapter {
  const adapter: ProviderAdapter = {
    ...definition,
    credentialType: definition.credentialType ?? (definition.authType === "oauth" ? "oauth" : definition.authType === "api_key" ? "api_key" : definition.requiresConnectedAccount ? "connected_account" : "none"),
    credentialFields: definition.credentialFields ?? [],
    oauthConfig: definition.oauthConfig ?? {},
    authType: definition.authType ?? (definition.requiresConnectedAccount ? "connected_account" : definition.kind === "workflow" ? "workflow_secret" : "none"),
    riskLevel: definition.riskLevel ?? "medium",
    supportsHealthCheck: Boolean(definition.supportsHealthCheck),
    runtimeConfig: definition.runtimeConfig,
    actionSchemas: definition.actionSchemas ?? [],
    canHandle(input) {
      if (input.preferredProviderId && input.preferredProviderId !== definition.providerId) return false;
      return definition.capabilities.includes(input.capabilityKey) && definition.actions.includes(input.action);
    },
    async execute(input: ProviderExecutionInput) {
      return executeProviderRuntime({
        provider: adapter,
        execution: input
      });
    }
  };
  return normalizeProviderManifest(adapter);
}
