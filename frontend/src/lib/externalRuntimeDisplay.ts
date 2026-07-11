import type { ActivityLog, Agent, AgentRunResult } from "../api/types";

export type ExternalRuntimeDisplay = NonNullable<AgentRunResult["externalRuntime"]>;

export function isExternalAgent(agent?: Agent | null) {
  const sourceType = agent?.capabilityManifest.sourceType;
  return sourceType === "mcp_server" || sourceType === "openapi_endpoint";
}

export function externalSourceLabel(sourceType?: string) {
  if (sourceType === "mcp_server") return "External MCP agent";
  if (sourceType === "openapi_endpoint") return "External OpenAPI agent";
  return "External agent";
}

export function externalVerificationLabel(status?: string) {
  if (status === "verified") return "Verified";
  if (status === "blocked") return "Blocked";
  return "Waiting for review";
}

export function hostFromAgent(agent?: Agent | null) {
  const url = agent?.capabilityManifest.externalEndpointUrl;
  if (!url) return "";
  try {
    return new globalThis.URL(url).hostname;
  } catch {
    return "";
  }
}

export function parseExternalRuntime(value: unknown): ExternalRuntimeDisplay | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.source !== "external_agent_runtime") return undefined;
  const sourceType = record.sourceType === "mcp_server" || record.sourceType === "openapi_endpoint" ? record.sourceType : undefined;
  if (!sourceType) return undefined;
  const proxyStatus = ["executed", "blocked", "timed_out", "failed", "pending_human_approval", "prepared"].includes(String(record.proxyStatus))
    ? record.proxyStatus as ExternalRuntimeDisplay["proxyStatus"]
    : undefined;
  return {
    source: "external_agent_runtime",
    sourceType,
    endpointHost: typeof record.endpointHost === "string" ? record.endpointHost : undefined,
    proxyStatus,
    durationMs: typeof record.durationMs === "number" ? record.durationMs : undefined,
    blockedReason: typeof record.blockedReason === "string" ? record.blockedReason : undefined
  };
}

export function externalBlockedReasonLabel(reason?: string) {
  if (!reason) return "";
  if (reason === "unsafe_external_endpoint") return "This agent's endpoint is not allowed.";
  if (reason === "external_protocol_mismatch") return "This agent's verified setup does not match its runtime.";
  if (reason === "external_runtime_timeout") return "The external agent took too long to respond.";
  if (reason === "external_agent_not_verified") return "This agent is waiting for marketplace verification.";
  if (reason === "missing_private_info_permission") return "It needs permission before private info can be shared.";
  if (reason === "missing_action_permission") return "It needs action permission before it can continue.";
  if (reason.startsWith("provider_http_")) return "The external agent returned an error.";
  return reason.replace(/_/g, " ");
}

export function externalRuntimeSummary(runtime?: ExternalRuntimeDisplay) {
  if (!runtime) return "";
  if (runtime.proxyStatus === "executed") return "External agent response";
  if (runtime.proxyStatus === "pending_human_approval") return "External action waiting for approval";
  if (runtime.proxyStatus === "timed_out") return "External agent timed out";
  if (runtime.proxyStatus === "failed") return "External agent returned an error";
  if (runtime.proxyStatus === "blocked") return "External agent blocked by safety";
  return "External agent checked by safety";
}

export function externalRuntimeDetail(runtime?: ExternalRuntimeDisplay) {
  if (!runtime) return "";
  const host = runtime.endpointHost ? `Host: ${runtime.endpointHost}. ` : "";
  const duration = typeof runtime.durationMs === "number" && runtime.durationMs > 0 ? `Duration: ${runtime.durationMs} ms. ` : "";
  const reason = externalBlockedReasonLabel(runtime.blockedReason);
  return `${host}${duration}${reason}`.trim();
}

export function externalLogDisplay(log: ActivityLog) {
  const metadata = log.dynamicMetadata ?? {};
  if (metadata.source !== "external_agent_runtime") return undefined;
  const status = String(metadata.proxyStatus ?? "");
  const sourceType = typeof metadata.sourceType === "string" ? metadata.sourceType : undefined;
  const runtime = parseExternalRuntime({
    source: "external_agent_runtime",
    sourceType,
    endpointHost: metadata.endpointHost,
    proxyStatus: status || (log.status === "success" ? "executed" : "blocked"),
    durationMs: metadata.durationMs,
    blockedReason: metadata.blockedReason
  });
  const title = runtime?.proxyStatus === "executed"
    ? "External agent ran through AI Agent Hub"
    : runtime?.proxyStatus === "timed_out"
      ? "External agent timed out"
      : runtime?.proxyStatus === "failed"
        ? "External agent returned an error"
        : runtime?.proxyStatus === "pending_human_approval"
          ? "External agent is waiting for approval"
          : "External agent blocked before leaving AI Agent Hub";
  const details = [
    runtime?.endpointHost ? `Host: ${runtime.endpointHost}` : "",
    Array.isArray(metadata.usedSchemas) && metadata.usedSchemas.length ? `Shared: ${metadata.usedSchemas.join(", ")}` : "",
    typeof metadata.actionName === "string" && metadata.actionName ? `Action: ${metadata.actionName.replace(/_/g, " ")}` : "",
    typeof metadata.durationMs === "number" ? `Duration: ${metadata.durationMs} ms` : "",
    externalBlockedReasonLabel(runtime?.blockedReason)
  ].filter(Boolean);
  return {
    title,
    detail: details.join(" | "),
    runtime
  };
}
