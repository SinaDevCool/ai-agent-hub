import { deploymentInfo, env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { listConnectorProviders } from "./connectorProviderRegistryService.js";

type CheckStatus = "pass" | "warning" | "block";

function check(key: string, label: string, status: CheckStatus, detail: string) {
  return { key, label, status, detail };
}

export async function getProviderActivationReadiness(providerId = "cal-com") {
  const provider = listConnectorProviders().find((item) => item.providerId === providerId);
  const connections = await prisma.providerConnection.findMany({
    where: { providerId },
    select: { status: true, scopes: true, lastValidatedAt: true, lastSuccessAt: true, lastFailureAt: true, lastFailureReason: true }
  });
  const activeConnections = connections.filter((item) => item.status === "active");
  const lastSuccessAt = activeConnections.map((item) => item.lastSuccessAt).filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const lastFailure = connections.filter((item) => item.lastFailureAt).sort((a, b) => (b.lastFailureAt?.getTime() ?? 0) - (a.lastFailureAt?.getTime() ?? 0))[0];
  const enabled = providerId === "cal-com" ? env.LIVE_APPOINTMENTS_ENABLED === "true" : false;
  const configured = providerId === "cal-com" ? Boolean(env.CALCOM_WEBHOOK_SECRET) : false;
  const health = provider?.healthCheck ? await provider.healthCheck({ userId: "system-activation-readiness" }) : { state: "unknown", message: "No health check is registered.", checkedAt: new Date().toISOString() };
  const checks = [
    check("adapter", "Provider adapter", provider ? "pass" : "block", provider ? `${provider.label} API v2 adapter is registered.` : "Register the provider adapter."),
    check("feature_flag", "Feature flag / kill switch", enabled ? "warning" : "pass", enabled ? "Live appointment calls are enabled. Use LIVE_APPOINTMENTS_ENABLED=false as the immediate kill switch." : "Live calls are disabled; sandbox remains available."),
    check("webhook_secret", "Webhook verification", configured ? "pass" : "block", configured ? "A Cal.com webhook secret is configured." : "CALCOM_WEBHOOK_SECRET is missing."),
    check("provider_health", "Provider health", health.state === "healthy" ? "pass" : health.state === "disabled" ? "warning" : "block", health.message),
    check("connection", "Beta-user connection", activeConnections.length ? "pass" : "block", activeConnections.length ? `${activeConnections.length} active encrypted connection(s).` : "No active Cal.com beta-user connection."),
    check("staging_test", "Last successful staging test", deploymentInfo.environment === "staging" && lastSuccessAt ? "pass" : "block", lastSuccessAt ? `Last successful credential test: ${lastSuccessAt.toISOString()} (${deploymentInfo.environment}).` : "Run a successful credential test in staging."),
    check("scopes", "Permissions and scopes", activeConnections.length ? "warning" : "block", activeConnections.length ? "Cal.com API keys are account-level credentials; the hub limits use to availability, booking, reschedule, cancellation, and status endpoints." : "Connect an account and review the requested capability disclosure."),
    check("acceptance", "Release evidence", "block", "Attach dated availability, booking, duplicate, cancellation, expiry, timeout, and approval-replay evidence."),
    check("sign_off", "Required sign-offs", "block", "Privacy/regional review and named support owner approval are still required.")
  ];
  return {
    providerId,
    providerLabel: provider?.label ?? providerId,
    generatedAt: new Date().toISOString(),
    release: deploymentInfo,
    mode: enabled ? "live" : "sandbox",
    killSwitch: { environmentKey: "LIVE_APPOINTMENTS_ENABLED", engaged: !enabled },
    configuration: { webhookSecret: configured, registeredAdapter: Boolean(provider) },
    health,
    connections: { total: connections.length, active: activeConnections.length, lastSuccessAt: lastSuccessAt?.toISOString() ?? null, lastFailureAt: lastFailure?.lastFailureAt?.toISOString() ?? null, lastFailureReason: lastFailure?.lastFailureReason ?? null },
    checks,
    status: checks.some((item) => item.status === "block") ? "blocked" : checks.some((item) => item.status === "warning") ? "conditional" : "ready"
  } as const;
}
