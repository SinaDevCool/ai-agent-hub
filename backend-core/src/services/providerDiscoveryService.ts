import { getConnectorCapability, listConnectorCapabilities } from "./connectorCapabilityService.js";
import { listConnectorProviders } from "./connectorProviderRegistryService.js";
import { getProviderHealthForUser } from "./providerHealthService.js";
import { prisma } from "../db/prisma.js";
import { serializeProviderActionSchema } from "./providers/providerManifestService.js";
import { providerNeedsConnection } from "./providerConnectionPolicyService.js";

export async function listProviderDiscovery(input: { userId: string }) {
  const capabilities = listConnectorCapabilities();
  const providers = await Promise.all(listConnectorProviders().map(async (provider) => {
    const connections = await prisma.providerConnection.findMany({
      where: { userId: input.userId, providerId: provider.providerId },
      orderBy: { updatedAt: "desc" },
      select: {
        status: true,
        lastValidatedAt: true,
        lastFailureReason: true
      }
    });
    const latestConnection = connections[0];
    const providerCapabilities = capabilities
      .filter((capability) => provider.capabilities.includes(capability.canonicalKey))
      .map((capability) => ({
        key: capability.canonicalKey,
        label: capability.label,
        category: capability.category,
        description: capability.description,
        defaultAction: capability.defaultAction,
        risk: capability.risk,
        actions: provider.actions,
        actionSchemas: (provider.actionSchemas ?? [])
          .filter((schema) => schema.capabilityKey === capability.canonicalKey)
          .map(serializeProviderActionSchema)
      }));
    const health = await Promise.all(providerCapabilities.map(async (capability) => {
      const state = await getProviderHealthForUser({
        userId: input.userId,
        capabilityKey: capability.key,
        providerId: provider.providerId
      });
      return {
        capabilityKey: capability.key,
        state: latestConnection?.status === "disabled" ? "disabled" : state[0]?.state ?? "not_configured",
        readiness: latestConnection?.status === "disabled" ? "disabled" : state[0]?.readiness ?? "not_configured",
        message: state[0]?.message ?? `Connect a provider for ${capability.label}.`,
        nextAction: state[0]?.nextAction
      };
    }));
    const requiresConnection = providerNeedsConnection(provider);
    return {
      providerId: provider.providerId,
      label: provider.label,
      kind: provider.kind,
      credentialType: provider.credentialType ?? "none",
      credentialFields: provider.credentialFields ?? [],
      authType: provider.authType,
      riskLevel: provider.riskLevel,
      requiresConnectedAccount: provider.requiresConnectedAccount,
      requiresConnection,
      canConnect: requiresConnection,
      connectAction: latestConnection?.status === "expired" || latestConnection?.status === "revoked" || latestConnection?.status === "reconnect_required"
        ? "reconnect"
        : requiresConnection
          ? "connect"
          : "none",
      connectionStatus: latestConnection?.status ?? (requiresConnection ? "not_connected" : "not_required"),
      connectedCount: connections.filter((connection) => connection.status === "active").length,
      lastValidatedAt: latestConnection?.lastValidatedAt?.toISOString() ?? null,
      lastFailureReason: latestConnection?.lastFailureReason ?? null,
      supportsHealthCheck: provider.supportsHealthCheck,
      description: provider.description,
      actionSchemas: (provider.actionSchemas ?? []).map(serializeProviderActionSchema),
      capabilities: providerCapabilities,
      health
    };
  }));

  return {
    capabilities: capabilities.map((capability) => ({
      ...capability,
      providerCount: providers.filter((provider) => provider.capabilities.some((item) =>
        getConnectorCapability(item.key)?.canonicalKey === capability.canonicalKey
      )).length
    })),
    providers
  };
}
