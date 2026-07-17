import { setTimeout, clearTimeout } from "node:timers";
import type { RiskLevel } from "@prisma/client";
import { env } from "../../config/env.js";
import { validateExternalUrl } from "../policy/externalUrlPolicyService.js";
import { buildProviderAuthHeaders } from "../providerConnectionPolicyService.js";
import {
  findExistingProviderRun,
  markProviderRunBlocked,
  markProviderRunSucceeded,
  providerRunResultFromExisting,
  startProviderRun
} from "../providerRunService.js";
import { executeTool } from "../toolExecutionService.js";
import type { ToolBlockDetails, ToolExecutionResult } from "../tools/toolExecutionTypes.js";
import type { ProviderAdapter, ProviderExecutionInput, ProviderRuntimeConfig } from "./providerAdapterTypes.js";

type FetchLike = typeof fetch;

let runtimeFetchImpl: FetchLike = fetch;

export function setProviderRuntimeFetchForTest(nextFetch: FetchLike) {
  runtimeFetchImpl = nextFetch;
}

export function resetProviderRuntimeFetchForTest() {
  runtimeFetchImpl = fetch;
}

type ProviderRuntimeInput = {
  provider: ProviderAdapter;
  execution: ProviderExecutionInput;
};

type RuntimeToolRunInput = {
  provider: ProviderAdapter;
  execution: ProviderExecutionInput;
  riskLevel?: RiskLevel;
};

type RuntimeResponseInput = {
  provider: ProviderAdapter;
  execution: ProviderExecutionInput;
  toolRunId: string;
  endpointUrl: URL;
  response: Response;
  resultPath?: string;
  maxResponseBytes: number;
};

function runtimeConfig(provider: ProviderAdapter): ProviderRuntimeConfig {
  return provider.runtimeConfig ?? {};
}

function clamp(value: number | undefined, fallback: number, min: number, max: number) {
  return Math.min(Math.max(value ?? fallback, min), max);
}

function cleanText(value: unknown, fallback: string, maxLength = 1200) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength) || fallback;
}

function getByPath(value: unknown, path: string | undefined) {
  if (!path) return value;
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

function messageFromBody(body: unknown) {
  if (!body || typeof body !== "object") return cleanText(body, "", 1200);
  const record = body as Record<string, unknown>;
  return cleanText(record.reply ?? record.message ?? record.summary ?? record.output ?? record.result, "", 1200);
}

function metadataFromBody(body: unknown) {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  return {
    externalRequestId: typeof record.requestId === "string" ? record.requestId.slice(0, 120) : undefined,
    externalStatus: typeof record.status === "string" ? record.status.slice(0, 80) : undefined,
    items: Array.isArray(record.items) ? record.items.slice(0, 12) : undefined,
    options: Array.isArray(record.options) ? record.options.slice(0, 12) : undefined
  };
}

function buildRuntimeHeaders(input: ProviderRuntimeInput, config: ProviderRuntimeConfig) {
  return buildProviderAuthHeaders({
    provider: input.provider,
    credentials: input.execution.providerConnection?.credentials,
    providerConnection: input.execution.providerConnection,
    runtimeConfig: config,
    baseHeaders: {
      accept: "application/json",
      "content-type": "application/json"
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJsonMaybe(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function connectorInput(input: ProviderRuntimeInput) {
  return {
    ...input.execution.input,
    capabilityKey: input.execution.capability.canonicalKey,
    connectorAction: input.execution.action,
    connectorProviderId: input.provider.providerId,
    connectorAttempt: input.execution.attempt
  };
}

function getMatchingMcpTool(input: ProviderRuntimeInput) {
  const tools = runtimeConfig(input.provider).mcpTools ?? [];
  return tools.find((tool) =>
    tool.capabilityKey === input.execution.capability.canonicalKey && tool.action === input.execution.action
  ) ?? tools.find((tool) => tool.capabilityKey === input.execution.capability.canonicalKey) ?? null;
}

function getMatchingOpenApiOperation(input: ProviderRuntimeInput) {
  const operations = runtimeConfig(input.provider).operations ?? [];
  return operations.find((operation) =>
    operation.capabilityKey === input.execution.capability.canonicalKey && operation.action === input.execution.action
  ) ?? operations.find((operation) => operation.capabilityKey === input.execution.capability.canonicalKey) ?? null;
}

function buildOpenApiOperationUrl(input: ProviderRuntimeInput, operationPath: string, endpointUrl: URL) {
  const pathParamKeys = Array.from(operationPath.matchAll(/\{([^}]+)\}/g)).map((match) => match[1]);
  let path = operationPath;
  for (const key of pathParamKeys) {
    const value = input.execution.input[key];
    path = path.replace(`{${key}}`, encodeURIComponent(String(value ?? "")));
  }
  const url = new URL(path, endpointUrl);
  return { url, pathParamKeys };
}

function queryInputForOpenApi(input: ProviderRuntimeInput, excludedKeys: string[]) {
  const excluded = new Set(["message", "capabilityKey", "connectorAction", "connectorProviderId", "connectorAttempt", ...excludedKeys]);
  return Object.entries(input.execution.input)
    .filter(([key, value]) => !excluded.has(key) && value !== undefined && value !== null && typeof value !== "object")
    .map(([key, value]) => [key, String(value)] as const);
}

async function resultFromResponse(input: RuntimeResponseInput) {
  const rawText = await input.response.text();
  const truncated = rawText.length > input.maxResponseBytes;
  const limitedText = rawText.slice(0, input.maxResponseBytes);
  const body = parseJsonMaybe(limitedText);
  const selectedBody = getByPath(body, input.resultPath);
  const reply = messageFromBody(selectedBody) || messageFromBody(body) || "The provider completed the request.";
  const result = {
    provider: input.provider.providerId,
    providerKind: input.provider.kind,
    endpointHost: input.endpointUrl.hostname,
    providerStatus: input.response.status,
    reply,
    responseTruncated: truncated,
    ...metadataFromBody(selectedBody),
    raw: selectedBody
  };
  if (!input.response.ok) {
    const transient = input.response.status === 408 || input.response.status === 429 || input.response.status >= 500;
    return markRuntimeBlocked(input.toolRunId, {
      code: transient ? "provider_unavailable" : "provider_error",
      userMessage: transient
        ? "This provider is temporarily unavailable. Try again in a moment."
        : "This provider could not complete the request. Check the provider setup.",
      technicalMessage: `Provider returned HTTP ${input.response.status}.`,
      nextAction: transient ? "try_again" : "fix_workflow",
      retryable: transient
    });
  }
  return markRuntimeSucceeded(input.toolRunId, result);
}

function resultFromMcpBody(body: unknown) {
  if (!isRecord(body)) return body;
  if (isRecord(body.error)) return body;
  const result = body.result;
  if (!isRecord(result)) return result ?? body;
  const content = result.content;
  if (!Array.isArray(content)) return result;
  const textContent = content
    .filter(isRecord)
    .map((item) => typeof item.text === "string" ? item.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!textContent) return result;
  return parseJsonMaybe(textContent);
}

async function findExistingRun(input: RuntimeToolRunInput) {
  return findExistingProviderRun({
    userId: input.execution.userId,
    idempotencyKey: input.execution.idempotencyKey
  });
}

function resultFromExisting(run: Awaited<ReturnType<typeof findExistingRun>>): ToolExecutionResult | null {
  return providerRunResultFromExisting(run);
}

async function createRuntimeToolRun(input: RuntimeToolRunInput) {
  const started = await startProviderRun({
    userId: input.execution.userId,
    agentId: input.execution.agentId,
    agentRunId: input.execution.agentRunId,
    toolName: input.provider.toolName,
    input: {
      providerId: input.provider.providerId,
      capabilityKey: input.execution.capability.canonicalKey,
      action: input.execution.action,
      input: input.execution.input,
      attempt: input.execution.attempt
    },
    riskLevel: input.riskLevel ?? input.provider.riskLevel,
    requiresApproval: false,
    idempotencyKey: input.execution.idempotencyKey
  });
  if (!started.toolRun) throw new Error("Provider runtime run was not created.");
  return started.toolRun;
}

async function markRuntimeSucceeded(toolRunId: string, result: Record<string, unknown>) {
  return markProviderRunSucceeded({ toolRunId, result });
}

async function markRuntimeBlocked(toolRunId: string, details: ToolBlockDetails & { reason?: string }) {
  return markProviderRunBlocked({
    toolRunId,
    reason: details.reason,
    code: details.code,
    userMessage: details.userMessage,
    technicalMessage: details.technicalMessage,
    nextAction: details.nextAction,
    retryable: details.retryable
  });
}

function buildRuntimePayload(input: ProviderRuntimeInput) {
  return {
    providerId: input.provider.providerId,
    capabilityKey: input.execution.capability.canonicalKey,
    action: input.execution.action,
    input: input.execution.input,
    attempt: input.execution.attempt,
    context: {
      userId: input.execution.userId,
      agentId: input.execution.agentId,
      agentRunId: input.execution.agentRunId,
      providerConnectionId: input.execution.providerConnection?.id,
      approvedByRequestId: input.execution.approvalOverride?.hitlRequestId
    }
  };
}

async function executeWorkflowRuntime(input: ProviderRuntimeInput): Promise<ToolExecutionResult> {
  return executeTool({
    userId: input.execution.userId,
    agentId: input.execution.agentId,
    agentRunId: input.execution.agentRunId,
    toolName: input.provider.toolName,
    arguments: {
      ...input.execution.input,
      capabilityKey: input.execution.capability.canonicalKey,
      connectorAction: input.execution.action,
      connectorProviderId: input.provider.providerId,
      connectorAttempt: input.execution.attempt,
      previousToolRunId: input.execution.previousToolRunId
    },
    idempotencyKey: input.execution.idempotencyKey,
    approvalOverride: input.execution.approvalOverride
  });
}

async function executeApiRuntime(input: ProviderRuntimeInput): Promise<ToolExecutionResult> {
  const existing = resultFromExisting(await findExistingRun(input));
  if (existing) return existing;
  const toolRun = await createRuntimeToolRun(input);
  const config = runtimeConfig(input.provider);
  const urlDecision = validateExternalUrl(config.endpointUrl);
  if (!urlDecision.allowed) {
    return markRuntimeBlocked(toolRun.id, {
      code: "unsafe_external_url",
      userMessage: "This provider endpoint is not safe to call.",
      technicalMessage: urlDecision.reason,
      nextAction: "fix_workflow",
      retryable: false
    });
  }

  const timeoutMs = clamp(config.timeoutMs, env.EXTERNAL_RUNTIME_TIMEOUT_MS, 500, 30_000);
  const maxResponseBytes = clamp(config.maxResponseBytes, env.EXTERNAL_RUNTIME_MAX_RESPONSE_BYTES, 1024, 250_000);
  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = buildRuntimeHeaders(input, config);
  if (!headers.ok) {
    clearTimeout(timeout);
    return markRuntimeBlocked(toolRun.id, headers.details);
  }

  try {
    const method = config.method ?? "POST";
    const response = await runtimeFetchImpl(urlDecision.url, {
      method,
      headers: headers.headers,
      body: method === "GET" ? undefined : JSON.stringify(buildRuntimePayload(input)),
      signal: controller.signal
    });
    return resultFromResponse({
      provider: input.provider,
      execution: input.execution,
      toolRunId: toolRun.id,
      endpointUrl: urlDecision.url,
      response,
      resultPath: config.resultPath,
      maxResponseBytes
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return markRuntimeBlocked(toolRun.id, {
      code: "provider_unavailable",
      userMessage: timedOut
        ? "This provider took too long to respond. Try again in a moment."
        : "This provider could not be reached. Check the provider status.",
      technicalMessage: timedOut ? "Provider runtime timed out." : "Provider runtime network request failed.",
      nextAction: timedOut ? "try_again" : "fix_workflow",
      retryable: true
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function executeMcpRuntime(input: ProviderRuntimeInput): Promise<ToolExecutionResult> {
  const existing = resultFromExisting(await findExistingRun(input));
  if (existing) return existing;
  const toolRun = await createRuntimeToolRun(input);
  const config = runtimeConfig(input.provider);
  const urlDecision = validateExternalUrl(config.endpointUrl);
  if (!urlDecision.allowed) {
    return markRuntimeBlocked(toolRun.id, {
      code: "unsafe_external_url",
      userMessage: "This MCP endpoint is not safe to call.",
      technicalMessage: urlDecision.reason,
      nextAction: "fix_workflow",
      retryable: false
    });
  }
  const tool = getMatchingMcpTool(input);
  if (!tool) {
    return markRuntimeBlocked(toolRun.id, {
      code: "provider_error",
      userMessage: "This imported agent does not expose a matching MCP tool yet.",
      technicalMessage: `No MCP tool mapping for '${input.execution.capability.canonicalKey}' and '${input.execution.action}'.`,
      nextAction: "fix_workflow",
      retryable: false
    });
  }

  const timeoutMs = clamp(config.timeoutMs, env.EXTERNAL_RUNTIME_TIMEOUT_MS, 500, 30_000);
  const maxResponseBytes = clamp(config.maxResponseBytes, env.EXTERNAL_RUNTIME_MAX_RESPONSE_BYTES, 1024, 250_000);
  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = buildRuntimeHeaders(input, config);
  if (!headers.ok) {
    clearTimeout(timeout);
    return markRuntimeBlocked(toolRun.id, headers.details);
  }
  try {
    const response = await runtimeFetchImpl(urlDecision.url, {
      method: "POST",
      headers: headers.headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: toolRun.id,
        method: "tools/call",
        params: {
          name: tool.name,
          arguments: connectorInput(input)
        }
      }),
      signal: controller.signal
    });
    const rawText = await response.text();
    const truncated = rawText.length > maxResponseBytes;
    const body = parseJsonMaybe(rawText.slice(0, maxResponseBytes));
    if (isRecord(body) && isRecord(body.error)) {
      return markRuntimeBlocked(toolRun.id, {
        code: "provider_error",
        userMessage: "This MCP tool could not complete the request. Check the agent setup.",
        technicalMessage: cleanText(body.error.message ?? "MCP JSON-RPC error.", "MCP JSON-RPC error."),
        nextAction: "fix_workflow",
        retryable: false
      });
    }
    const selectedBody = resultFromMcpBody(body);
    const reply = messageFromBody(selectedBody) || "The MCP tool completed the request.";
    return markRuntimeSucceeded(toolRun.id, {
      provider: input.provider.providerId,
      providerKind: input.provider.kind,
      endpointHost: urlDecision.url.hostname,
      providerStatus: response.status,
      reply,
      responseTruncated: truncated,
      ...metadataFromBody(selectedBody),
      raw: selectedBody
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return markRuntimeBlocked(toolRun.id, {
      code: "provider_unavailable",
      userMessage: timedOut
        ? "This MCP tool took too long to respond. Try again in a moment."
        : "This MCP tool could not be reached. Check the agent setup.",
      technicalMessage: timedOut ? "MCP runtime timed out." : "MCP runtime network request failed.",
      nextAction: timedOut ? "try_again" : "fix_workflow",
      retryable: true
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function executeOpenApiRuntime(input: ProviderRuntimeInput): Promise<ToolExecutionResult> {
  const existing = resultFromExisting(await findExistingRun(input));
  if (existing) return existing;
  const toolRun = await createRuntimeToolRun(input);
  const config = runtimeConfig(input.provider);
  const endpointDecision = validateExternalUrl(config.endpointUrl);
  if (!endpointDecision.allowed) {
    return markRuntimeBlocked(toolRun.id, {
      code: "unsafe_external_url",
      userMessage: "This OpenAPI endpoint is not safe to call.",
      technicalMessage: endpointDecision.reason,
      nextAction: "fix_workflow",
      retryable: false
    });
  }
  const operation = getMatchingOpenApiOperation(input);
  if (!operation?.path || !operation.method) {
    return markRuntimeBlocked(toolRun.id, {
      code: "provider_error",
      userMessage: "This imported agent does not expose a matching OpenAPI action yet.",
      technicalMessage: `No OpenAPI operation mapping for '${input.execution.capability.canonicalKey}' and '${input.execution.action}'.`,
      nextAction: "fix_workflow",
      retryable: false
    });
  }
  const { url, pathParamKeys } = buildOpenApiOperationUrl(input, operation.path, endpointDecision.url);
  const urlDecision = validateExternalUrl(url.toString());
  if (!urlDecision.allowed) {
    return markRuntimeBlocked(toolRun.id, {
      code: "unsafe_external_url",
      userMessage: "This OpenAPI action URL is not safe to call.",
      technicalMessage: urlDecision.reason,
      nextAction: "fix_workflow",
      retryable: false
    });
  }
  const method = operation.method;
  for (const [key, value] of queryInputForOpenApi(input, pathParamKeys)) {
    if (method === "GET" || method === "DELETE") urlDecision.url.searchParams.set(key, value);
  }

  const timeoutMs = clamp(config.timeoutMs, env.EXTERNAL_RUNTIME_TIMEOUT_MS, 500, 30_000);
  const maxResponseBytes = clamp(config.maxResponseBytes, env.EXTERNAL_RUNTIME_MAX_RESPONSE_BYTES, 1024, 250_000);
  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = buildRuntimeHeaders(input, config);
  if (!headers.ok) {
    clearTimeout(timeout);
    return markRuntimeBlocked(toolRun.id, headers.details);
  }
  try {
    const response = await runtimeFetchImpl(urlDecision.url, {
      method,
      headers: headers.headers,
      body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(connectorInput(input)),
      signal: controller.signal
    });
    return resultFromResponse({
      provider: input.provider,
      execution: input.execution,
      toolRunId: toolRun.id,
      endpointUrl: urlDecision.url,
      response,
      resultPath: config.resultPath,
      maxResponseBytes
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return markRuntimeBlocked(toolRun.id, {
      code: "provider_unavailable",
      userMessage: timedOut
        ? "This OpenAPI action took too long to respond. Try again in a moment."
        : "This OpenAPI action could not be reached. Check the agent setup.",
      technicalMessage: timedOut ? "OpenAPI runtime timed out." : "OpenAPI runtime network request failed.",
      nextAction: timedOut ? "try_again" : "fix_workflow",
      retryable: true
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function executeUnavailableRuntime(input: ProviderRuntimeInput): Promise<ToolExecutionResult> {
  const existing = resultFromExisting(await findExistingRun(input));
  if (existing) return existing;
  const toolRun = await createRuntimeToolRun(input);
  const label = input.provider.kind === "manual"
    ? "This provider needs a manual handoff before it can continue."
    : `${input.provider.label} is not wired to a runtime adapter yet.`;
  return markRuntimeBlocked(toolRun.id, {
    code: "adapter_not_implemented",
    userMessage: label,
    technicalMessage: `Provider runtime '${input.provider.kind}' is not implemented for '${input.provider.providerId}'.`,
    nextAction: "contact_support",
    retryable: false
  });
}

export async function executeProviderRuntime(input: ProviderRuntimeInput): Promise<ToolExecutionResult> {
  if (input.provider.kind === "workflow" || input.provider.kind === "native" || input.provider.kind === "oauth_api") {
    return executeWorkflowRuntime(input);
  }
  if (input.provider.kind === "mcp") return executeMcpRuntime(input);
  if (input.provider.kind === "openapi") return executeOpenApiRuntime(input);
  if (input.provider.kind === "api") return executeApiRuntime(input);
  return executeUnavailableRuntime(input);
}
