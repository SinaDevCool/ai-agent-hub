import { z } from "zod";
import { interpretationResultSchema } from "../agentInterpretationSchema.js";
import type { InterpretationRequest, LanguageModelProvider } from "./languageModelProvider.js";

const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1)
});

export function createLocalOpenAiCompatibleProvider(input: {
  baseUrl: string;
  model: string;
  sessionToken?: string;
  timeoutMs?: number;
}): LanguageModelProvider {
  const baseUrl = new URL(input.baseUrl);
  if (baseUrl.hostname !== "127.0.0.1" && baseUrl.hostname !== "localhost") {
    throw new Error("Local inference must use a loopback address.");
  }
  return {
    id: input.model,
    executionLocation: "device",
    async interpret(request: InterpretationRequest) {
    const controller = new globalThis.AbortController();
      const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 15_000);
      try {
        const response = await fetch(new URL("/v1/chat/completions", baseUrl), {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            ...(input.sessionToken ? { authorization: `Bearer ${input.sessionToken}` } : {})
          },
          body: JSON.stringify({
            model: input.model,
            temperature: 0,
            messages: [
              { role: "system", content: "Interpret the request. Return only JSON matching the supplied schema. Never approve or execute a tool." },
              { role: "user", content: JSON.stringify({ request: request.message, declaredTools: request.manifest.tools ?? [] }) }
            ],
            response_format: { type: "json_object" }
          })
        });
        if (!response.ok) throw new Error(`Local inference returned HTTP ${response.status}.`);
        const body = responseSchema.parse(await response.json());
        return interpretationResultSchema.parse(JSON.parse(body.choices[0].message.content));
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
