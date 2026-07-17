import type { NormalizedConnectorResult } from "../connectorResultNormalizer.js";

function cleanText(value: string, fallback: string, maxLength: number) {
  return (value || fallback)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength) || fallback;
}

function safeUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function enforceProviderResultContract(result: NormalizedConnectorResult): NormalizedConnectorResult {
  const items = result.items.slice(0, 8).map((item) => ({
    ...item,
    title: cleanText(item.title, "Result", 160),
    subtitle: item.subtitle ? cleanText(item.subtitle, "", 180) : undefined,
    detail: item.detail ? cleanText(item.detail, "", 280) : undefined,
    price: item.price ? cleanText(item.price, "", 80) : undefined,
    url: safeUrl(item.url),
    metadata: item.metadata
  }));
  return {
    ...result,
    title: cleanText(result.title, "Provider result", 120),
    summary: cleanText(result.summary, "The connected provider completed the request.", 700),
    items,
    nextActions: result.nextActions.slice(0, 4).map((action) => ({
      label: cleanText(action.label, "Open", 80),
      url: safeUrl(action.url),
      value: action.value ? cleanText(action.value, "", 120) : undefined
    }))
  };
}
