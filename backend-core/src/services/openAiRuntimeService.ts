import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

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
  intent: "search" | "action" | "blocked";
  fallbackReply: string;
  documents?: RuntimeDocument[];
  usedSchemas?: string[];
};

type OpenAiRuntimeResult = {
  provider: "openai" | "local";
  model?: string;
  reply: string;
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
    message?: string;
  };
};

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
    return {
      provider: "local",
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
      throw new Error(body.error?.message ?? `OpenAI returned ${response.status}`);
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
    logger.warn({ err: error }, "OpenAI runtime reply failed; using local fallback");
    return {
      provider: "local",
      reply: input.fallbackReply
    };
  }
}
