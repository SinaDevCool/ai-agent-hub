import { prisma } from "../db/prisma.js";
import { lifeProviders } from "./lifePlatformCatalog.js";
import { listConnectorProviders } from "./connectorProviderRegistryService.js";

export async function listLifeProviderReadiness(userId: string) {
  const [definitions, connections, connectedAccounts] = await Promise.all([
    prisma.providerDefinition.findMany({ select: { providerId: true, status: true, healthStatus: true } }),
    prisma.providerConnection.findMany({ where: { userId }, select: { providerId: true, status: true } }),
    prisma.connectedAccount.findMany({ where: { userId }, select: { provider: true, status: true } })
  ]);
  const definitionByProvider = new Map(definitions.map((item) => [item.providerId, item]));
  const connectionByProvider = new Map(connections.map((item) => [item.providerId, item]));
  const registeredAdapterByProvider = new Map(listConnectorProviders().map((item) => [item.providerId, item]));
  return lifeProviders.map((provider) => {
    if (provider.id === "google-workspace" || provider.id === "microsoft-graph") {
      const accountProvider = provider.id === "google-workspace" ? "google" : "microsoft";
      const account = connectedAccounts.find((item) => item.provider === accountProvider);
      const executable = account?.status === "active";
      const product = provider.id === "google-workspace" ? "Google" : "Microsoft";
      return { providerId: provider.id, state: executable ? "ready" : "connection_required", executable, adapterStatus: "native", connectionStatus: account?.status ?? "missing", healthStatus: executable ? "healthy" : "unknown", nextStep: executable ? `Ready for approved ${product} capabilities.` : `Connect or reconnect ${product} in Settings.` };
    }
    const definition = definitionByProvider.get(provider.id);
    const connection = connectionByProvider.get(provider.id);
    const registeredAdapter = registeredAdapterByProvider.get(provider.id);
    const requiresConnection = provider.auth !== "none";
    const adapterActive = registeredAdapter ? true : definition?.status === "active";
    const executable = adapterActive && (!requiresConnection || connection?.status === "active");
    const state = executable ? "ready"
      : !registeredAdapter && !definition ? "adapter_required"
        : !registeredAdapter && definition?.status !== "active" ? "adapter_disabled"
          : !connection ? "connection_required"
            : connection.status === "reconnect_required" || connection.status === "expired" ? "reconnect_required"
              : "connection_error";
    return {
      providerId: provider.id,
      state,
      executable,
      adapterStatus: registeredAdapter ? "native" : definition?.status ?? "missing",
      connectionStatus: connection?.status ?? "missing",
      healthStatus: definition?.healthStatus ?? "unknown",
      nextStep: provider.access === "partner_approval" ? "Obtain provider partner approval, register the adapter, then connect credentials."
        : provider.access === "regulated_partner" ? "Complete regulated/commercial onboarding before registering credentials."
          : !registeredAdapter && !definition ? "Register and test a provider definition."
            : !connection ? "Connect provider credentials."
              : executable ? "Ready for eligible capabilities." : "Repair or re-enable this provider."
    };
  });
}
