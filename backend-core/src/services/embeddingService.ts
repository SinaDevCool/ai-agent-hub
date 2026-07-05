import { env } from "../config/env.js";
import { sha256 } from "./cryptoService.js";

export async function embedText(text: string): Promise<{ provider: string; vector: number[] }> {
  if (env.EMBEDDING_PROVIDER === "ollama") {
    const response = await fetch(env.OLLAMA_EMBEDDING_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: env.OLLAMA_EMBEDDING_MODEL, prompt: text.slice(0, 6000) })
    });
    if (!response.ok) throw new Error(`Ollama embedding failed with ${response.status}`);
    const data = (await response.json()) as { embedding?: number[] };
    return { provider: `ollama:${env.OLLAMA_EMBEDDING_MODEL}`, vector: data.embedding ?? [] };
  }

  const digest = sha256(text);
  const vector = Array.from({ length: 64 }, (_, index) => {
    const hex = digest.slice((index % 32) * 2, (index % 32) * 2 + 2);
    return (Number.parseInt(hex, 16) - 127.5) / 127.5;
  });
  return { provider: "local-hash", vector };
}
