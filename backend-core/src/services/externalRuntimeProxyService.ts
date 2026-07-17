import { setTimeout, clearTimeout } from "node:timers";
import { env } from "../config/env.js";
import type { AgentCapabilityManifest, RuntimeIntent } from "./agentRuntimeTypes.js";
import { validateExternalUrl } from "./policy/externalUrlPolicyService.js";

type ExternalSourceType = "mcp_server" | "openapi_endpoint";

type RuntimeDocumentSnippet = {
  id?: string;
  title?: string;
  excerpt?: string;
  relativePath?: string;
  vaultSchema?: { name?: string } | null;
};

export type ExternalRuntimeProxyRequest = {
  agentId: string;
  agentName: string;
  sourceType: ExternalSourceType;
  endpointUrl?: string;
  intent: RuntimeIntent;
  message: string;
  actionName?: string;
  usedSchemas?: string[];
  documents?: RuntimeDocumentSnippet[];
};

export type ExternalRuntimeProxyResult = {
  status: "ok" | "blocked" | "failed";
  reply: string;
  durationMs: number;
  endpointHost?: string;
  providerStatus?: number;
  blockedReason?: string;
  sanitizedMetadata: Record<string, unknown>;
};

type FetchLike = typeof fetch;

let fetchImpl: FetchLike = fetch;

export function setExternalRuntimeFetchForTest(nextFetch: FetchLike) {
  fetchImpl = nextFetch;
}

export function resetExternalRuntimeFetchForTest() {
  fetchImpl = fetch;
}

export function validateExternalRuntimeUrl(endpointUrl?: string) {
  return validateExternalUrl(endpointUrl);
}

function sanitizeText(value: unknown, maxLength = 4000) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function getProviderReply(body: unknown) {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  if (typeof record.reply === "string") return record.reply;
  if (typeof record.message === "string") return record.message;
  if (typeof record.output === "string") return record.output;
  const result = record.result;
  if (result && typeof result === "object") {
    const resultRecord = result as Record<string, unknown>;
    if (typeof resultRecord.reply === "string") return resultRecord.reply;
    if (typeof resultRecord.message === "string") return resultRecord.message;
    if (typeof resultRecord.content === "string") return resultRecord.content;
  }
  return "";
}

function metadataFromBody(body: unknown) {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  return {
    externalRequestId: typeof record.requestId === "string" ? record.requestId.slice(0, 120) : undefined,
    externalModel: typeof record.model === "string" ? record.model.slice(0, 120) : undefined,
    externalStatus: typeof record.status === "string" ? record.status.slice(0, 80) : undefined
  };
}

function buildPayload(input: ExternalRuntimeProxyRequest) {
  const payload = {
    agentId: input.agentId,
    agentName: input.agentName,
    message: input.message.slice(0, 8000),
    intent: input.intent,
    actionName: input.actionName,
    usedSchemas: input.usedSchemas ?? [],
    documents: (input.documents ?? []).slice(0, 5).map((document) => ({
      title: String(document.title ?? "").slice(0, 200),
      excerpt: String(document.excerpt ?? "").slice(0, 1200),
      schemaName: document.vaultSchema?.name ? String(document.vaultSchema.name).slice(0, 160) : undefined
    }))
  };
  if (input.sourceType === "mcp_server") {
    return {
      jsonrpc: "2.0",
      id: `aah-${Date.now()}`,
      method: "agent.run",
      params: payload
    };
  }
  return payload;
}

function protocolMatches(sourceType: ExternalSourceType, protocol?: AgentCapabilityManifest["protocol"]) {
  if (sourceType === "mcp_server") return protocol === "MCP";
  if (sourceType === "openapi_endpoint") return protocol === "OpenAPI";
  return false;
}

export async function runExternalRuntimeProxy(input: ExternalRuntimeProxyRequest & { protocol?: AgentCapabilityManifest["protocol"] }): Promise<ExternalRuntimeProxyResult> {
  const start = Date.now();
  if (!protocolMatches(input.sourceType, input.protocol)) {
    return {
      status: "blocked",
      reply: "This external helper's protocol does not match its verified source type.",
      durationMs: 0,
      blockedReason: "external_protocol_mismatch",
      sanitizedMetadata: { proxyStatus: "blocked" }
    };
  }

  const urlDecision = validateExternalRuntimeUrl(input.endpointUrl);
  if (!urlDecision.allowed) {
    return {
      status: "blocked",
      reply: urlDecision.reason,
      durationMs: 0,
      blockedReason: "unsafe_external_endpoint",
      sanitizedMetadata: { proxyStatus: "blocked", reason: urlDecision.reason }
    };
  }

  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EXTERNAL_RUNTIME_TIMEOUT_MS);
  try {
    const response = await fetchImpl(urlDecision.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(buildPayload(input)),
      signal: controller.signal
    });
    const rawText = await response.text();
    const durationMs = Date.now() - start;
    const truncated = rawText.length > env.EXTERNAL_RUNTIME_MAX_RESPONSE_BYTES;
    const limitedText = rawText.slice(0, env.EXTERNAL_RUNTIME_MAX_RESPONSE_BYTES);
    let body: unknown = limitedText;
    try {
      body = JSON.parse(limitedText);
    } catch {
      body = limitedText;
    }
    const reply = sanitizeText(getProviderReply(body) || body);
    const sanitizedMetadata = {
      ...metadataFromBody(body),
      proxyStatus: response.ok ? "executed" : "failed",
      responseTruncated: truncated
    };
    if (!response.ok) {
      return {
        status: "failed",
        reply: "The external helper could not complete this request.",
        durationMs,
        endpointHost: urlDecision.url.hostname,
        providerStatus: response.status,
        blockedReason: `provider_http_${response.status}`,
        sanitizedMetadata
      };
    }
    return {
      status: "ok",
      reply: reply || "The external helper completed the request.",
      durationMs,
      endpointHost: urlDecision.url.hostname,
      providerStatus: response.status,
      sanitizedMetadata
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      status: timedOut ? "blocked" : "failed",
      reply: timedOut
        ? "The external helper took too long to respond."
        : "The external helper could not be reached.",
      durationMs,
      endpointHost: urlDecision.url.hostname,
      blockedReason: timedOut ? "external_runtime_timeout" : "external_runtime_fetch_failed",
      sanitizedMetadata: {
        proxyStatus: timedOut ? "timed_out" : "failed",
        reason: timedOut ? "external_runtime_timeout" : "external_runtime_fetch_failed"
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}
