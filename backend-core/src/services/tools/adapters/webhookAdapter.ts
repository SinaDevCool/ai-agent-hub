import { setTimeout, clearTimeout } from "node:timers";
import { env } from "../../../config/env.js";
import { validateExternalUrl } from "../../policy/externalUrlPolicyService.js";
import {
  executeWorkflowConnection,
  resetWorkflowFetchForTest,
  setWorkflowFetchForTest
} from "../../workflowConnectionService.js";
import type { AdapterExecutionInput, ToolAdapter } from "../toolExecutionTypes.js";

type FetchLike = typeof fetch;

let fetchImpl: FetchLike = fetch;

export function setWebhookFetchForTest(nextFetch: FetchLike) {
  fetchImpl = nextFetch;
  setWorkflowFetchForTest(nextFetch);
}

export function resetWebhookFetchForTest() {
  fetchImpl = fetch;
  resetWorkflowFetchForTest();
}

function configString(input: AdapterExecutionInput, key: string) {
  const value = input.definition.adapterConfig?.[key];
  return typeof value === "string" ? value : undefined;
}

function configNumber(input: AdapterExecutionInput, key: string) {
  const value = input.definition.adapterConfig?.[key];
  return typeof value === "number" ? value : undefined;
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

function getWebhookReply(body: unknown) {
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
    externalStatus: typeof record.status === "string" ? record.status.slice(0, 80) : undefined
  };
}

function buildPayload(input: AdapterExecutionInput) {
  return {
    toolRunId: input.toolRunId,
    userId: input.userId,
    agentId: input.agentId,
    agentRunId: input.agentRunId,
    toolName: input.toolName,
    input: input.arguments,
    context: {
      approvedOnly: true
    }
  };
}

export const webhookAdapter: ToolAdapter = {
  type: "webhook",
  canHandle(definition) {
    return definition.adapterType === "webhook";
  },
  async execute(input) {
    const endpointUrl = configString(input, "endpointUrl");
    const workflowConnectionId = configString(input, "workflowConnectionId");
    if (workflowConnectionId || !endpointUrl) {
      return executeWorkflowConnection({
        workflowId: workflowConnectionId,
        userId: input.userId,
        agentId: input.agentId,
        agentRunId: input.agentRunId,
        toolRunId: input.toolRunId,
        toolName: input.toolName,
        arguments: input.arguments
      });
    }

    const urlDecision = validateExternalUrl(endpointUrl);
    if (!urlDecision.allowed) return { status: "blocked", reason: urlDecision.reason };

    const timeoutMs = Math.min(Math.max(configNumber(input, "timeoutMs") ?? env.EXTERNAL_RUNTIME_TIMEOUT_MS, 500), 30_000);
    const maxResponseBytes = Math.min(Math.max(configNumber(input, "maxResponseBytes") ?? env.EXTERNAL_RUNTIME_MAX_RESPONSE_BYTES, 1024), 250_000);
    const controller = new globalThis.AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
      const truncated = rawText.length > maxResponseBytes;
      const limitedText = rawText.slice(0, maxResponseBytes);
      let body: unknown = limitedText;
      try {
        body = JSON.parse(limitedText);
      } catch {
        body = limitedText;
      }
      const reply = sanitizeText(getWebhookReply(body) || body);
      const result = {
        provider: "webhook",
        endpointHost: urlDecision.url.hostname,
        providerStatus: response.status,
        reply: reply || "The workflow completed.",
        responseTruncated: truncated,
        ...metadataFromBody(body)
      };
      if (!response.ok) {
        const transient = response.status === 408 || response.status === 429 || response.status >= 500;
        return {
          status: "blocked",
          reason: `Webhook returned HTTP ${response.status}.`,
          code: "provider_error",
          userMessage: "The connected workflow did not complete the request. Check the workflow setup or try again.",
          technicalMessage: `Webhook returned HTTP ${response.status}.`,
          nextAction: transient ? "try_again" : "fix_workflow",
          retryable: transient
        };
      }
      return { status: "ok", result };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      return {
        status: "blocked",
        reason: timedOut ? "The webhook workflow took too long to respond." : "The webhook workflow could not be reached.",
        code: "provider_unavailable",
        userMessage: timedOut
          ? "The connected workflow took too long to respond. Try again or shorten the workflow."
          : "The connected workflow could not be reached. Check the workflow URL and provider status.",
        technicalMessage: timedOut ? "The webhook workflow took too long to respond." : "The webhook workflow could not be reached.",
        nextAction: timedOut ? "try_again" : "fix_workflow",
        retryable: true
      };
    } finally {
      clearTimeout(timeout);
    }
  }
};
