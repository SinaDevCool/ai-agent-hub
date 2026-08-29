import { getConnectorCapability, type ConnectorAction } from "./connectorCapabilityService.js";
import { createToolProviderAdapter } from "./providers/toolProviderAdapter.js";
import { normalizeProviderManifest } from "./providers/providerManifestService.js";
import type {
  ProviderActionSchema,
  ProviderAdapter,
  ProviderAuthType,
  ProviderCredentialField,
  ProviderCredentialType,
  ProviderKind,
  ProviderOAuthConfig,
  ProviderRiskLevel,
  ProviderRuntimeConfig
} from "./providers/providerAdapterTypes.js";
import { lifeCapabilities } from "./lifePlatformCatalog.js";
import { lifeSandboxProvider } from "./providers/lifeSandboxProvider.js";
import { duffelProvider } from "./providers/duffelProvider.js";
import { amadeusProvider } from "./providers/amadeusProvider.js";
import { plaidProvider } from "./providers/plaidProvider.js";
import { financeSandboxProvider } from "./providers/financeSandboxProvider.js";
import { calComProvider } from "./providers/calComProvider.js";

export type ConnectorProviderDefinition = {
  providerId: string;
  label: string;
  kind: ProviderKind;
  toolName: string;
  capabilities: string[];
  actions: ConnectorAction[];
  requiresConnectedAccount: boolean;
  credentialType?: ProviderCredentialType;
  credentialFields?: ProviderCredentialField[];
  oauthConfig?: ProviderOAuthConfig;
  authType?: ProviderAuthType;
  riskLevel?: ProviderRiskLevel;
  supportsHealthCheck?: boolean;
  runtimeConfig?: ProviderRuntimeConfig;
  actionSchemas?: ProviderActionSchema[];
  description: string;
};

const workflowProvider: ConnectorProviderDefinition = {
  providerId: "workflow",
  label: "Connected workflow",
  kind: "workflow",
  toolName: "workflow.run",
  capabilities: Array.from(new Set([
    "travel.search_hotels",
    "travel.search_flights",
    "travel.search_cars",
    "travel.hold_or_book",
    "travel.plan_trip",
    "email.follow_up",
    "finance.review_spending",
    "health.organize_notes",
    "general.research",
    ...lifeCapabilities.map((item) => item.key)
  ])),
  actions: ["search", "quote", "prepare_action", "reserve", "execute_action", "sync_status", "status", "cancel"],
  requiresConnectedAccount: false,
  credentialType: "none",
  credentialFields: [],
  oauthConfig: {},
  authType: "workflow_secret",
  riskLevel: "medium",
  supportsHealthCheck: true,
  description: "Runs a verified webhook workflow from n8n, Make, Zapier, or a custom provider."
};

const providerRegistry: ProviderAdapter[] = [createToolProviderAdapter(workflowProvider), normalizeProviderManifest(lifeSandboxProvider), normalizeProviderManifest(financeSandboxProvider), normalizeProviderManifest(duffelProvider), normalizeProviderManifest(amadeusProvider), normalizeProviderManifest(plaidProvider), normalizeProviderManifest(calComProvider)];

export function listConnectorProviders() {
  return providerRegistry;
}

export function registerConnectorProvider(provider: ConnectorProviderDefinition) {
  const existingIndex = providerRegistry.findIndex((item) => item.providerId === provider.providerId);
  const adapter = createToolProviderAdapter(provider);
  if (existingIndex >= 0) providerRegistry.splice(existingIndex, 1, adapter);
  else providerRegistry.push(adapter);
}

export function registerProviderAdapter(provider: ProviderAdapter) {
  const existingIndex = providerRegistry.findIndex((item) => item.providerId === provider.providerId);
  const normalized = normalizeProviderManifest({
    ...provider,
    canHandle: provider.canHandle ?? ((input) => {
      if (input.preferredProviderId && input.preferredProviderId !== provider.providerId) return false;
      return provider.capabilities.includes(input.capabilityKey) && provider.actions.includes(input.action);
    })
  });
  if (existingIndex >= 0) providerRegistry.splice(existingIndex, 1, normalized);
  else providerRegistry.push(normalized);
}

export function unregisterConnectorProvider(providerId: string) {
  const index = providerRegistry.findIndex((item) => item.providerId === providerId);
  if (index >= 0) providerRegistry.splice(index, 1);
}

export function resolveConnectorProvider(input: {
  capabilityKey: string;
  action?: ConnectorAction;
  preferredProviderId?: string;
}) {
  const capability = getConnectorCapability(input.capabilityKey);
  if (!capability) return null;
  const action = input.action ?? capability.defaultAction;
  const candidates = providerRegistry.filter((provider) => provider.canHandle({
    capabilityKey: capability.canonicalKey,
    action,
    preferredProviderId: input.preferredProviderId
  }) || (input.capabilityKey !== capability.canonicalKey && provider.canHandle({
    capabilityKey: input.capabilityKey,
    action,
    preferredProviderId: input.preferredProviderId
  })));
  return candidates[0] ?? null;
}
