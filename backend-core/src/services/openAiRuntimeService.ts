import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import type { RuntimeIntent } from "./agentRuntimeTypes.js";

type RuntimeDocument = {
  title?: string;
  excerpt?: string;
  vaultSchema?: {
    name?: string;
  } | null;
};

type OpenAiRuntimeInput = {
  agentName: string;
  agentDescription?: string;
  userMessage: string;
  status: "ok" | "blocked" | "awaiting_human_approval";
  intent: RuntimeIntent;
  fallbackReply: string;
  documents?: RuntimeDocument[];
  usedSchemas?: string[];
};

type OpenAiRuntimeResult = {
  provider: "openai" | "local";
  model?: string;
  reply: string;
  fallbackReason?: string;
};

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
};

class OpenAiRuntimeError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly type?: string
  ) {
    super(message);
  }
}

class RuntimeProviderUnavailableError extends Error {
  public readonly statusCode = 503;
  public readonly code = "runtime_provider_unavailable";

  constructor(message = "The AI runtime provider is unavailable.") {
    super(message);
  }
}

function classifyOpenAiFallback(error: unknown) {
  if (error instanceof OpenAiRuntimeError) {
    if (error.status === 401) return "auth_failed";
    if (error.status === 403) return "project_or_model_access";
    if (error.status === 404) return "model_not_found";
    if (error.status === 429) return "quota_or_rate_limit";
    if (error.status && error.status >= 500) return "openai_server_error";
    return `openai_http_${error.status ?? "error"}`;
  }
  return "openai_request_failed";
}

function getResponseText(body: OpenAiResponse) {
  if (body.output_text?.trim()) return body.output_text.trim();
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) return content.text.trim();
    }
  }
  return null;
}

function buildPrompt(input: OpenAiRuntimeInput) {
  const context = (input.documents ?? []).map((document, index) => ({
    index: index + 1,
    title: document.title,
    category: document.vaultSchema?.name,
    excerpt: document.excerpt
  }));

  return [
    "You are an AI agent inside AI Agent Hub, a consumer privacy-first personal agent platform.",
    "Write a short, helpful answer for a normal consumer.",
    "Use only the approved context provided below. Do not invent personal facts.",
    "Do not claim an action was completed unless runtime_status is ok and intent is action.",
    "If runtime_status is awaiting_human_approval, clearly say the action is waiting for user approval.",
    "If runtime_status is blocked, explain the limitation in plain language.",
    "Keep the answer under 120 words.",
    "",
    JSON.stringify({
      agent: {
        name: input.agentName,
        description: input.agentDescription
      },
      user_message: input.userMessage,
      runtime_status: input.status,
      intent: input.intent,
      allowed_categories: input.usedSchemas ?? [],
      approved_context: context,
      safe_fallback_reply: input.fallbackReply
    })
  ].join("\n");
}

export async function generateRuntimeReply(input: OpenAiRuntimeInput): Promise<OpenAiRuntimeResult> {
  if (!env.OPENAI_API_KEY) {
    if (env.NODE_ENV === "production") {
      throw new RuntimeProviderUnavailableError("OpenAI runtime is not configured for production.");
    }
    logger.warn("OpenAI runtime API key is not configured; using local fallback");
    return {
      provider: "local",
      fallbackReason: "config_missing",
      reply: input.fallbackReply
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        input: buildPrompt(input),
        max_output_tokens: 220
      })
    });

    const body = await response.json().catch(() => ({})) as OpenAiResponse;
    if (!response.ok) {
      throw new OpenAiRuntimeError(
        body.error?.message ?? `OpenAI returned ${response.status}`,
        response.status,
        body.error?.code,
        body.error?.type
      );
    }

    const reply = getResponseText(body);
    if (!reply) {
      throw new Error("OpenAI response did not include output text");
    }

    return {
      provider: "openai",
      model: env.OPENAI_MODEL,
      reply
    };
  } catch (error) {
    const fallbackReason = classifyOpenAiFallback(error);
    if (env.NODE_ENV === "production") {
      logger.error(
        {
          err: error,
          fallbackReason,
          openAiModel: env.OPENAI_MODEL
        },
        "OpenAI runtime reply failed in production"
      );
      throw new RuntimeProviderUnavailableError("OpenAI runtime could not complete this request.");
    }
    logger.warn(
      {
        err: error,
        fallbackReason,
        openAiModel: env.OPENAI_MODEL
      },
      "OpenAI runtime reply failed; using local fallback"
    );
    return {
      provider: "local",
      fallbackReason,
      reply: input.fallbackReply
    };
  }
}
