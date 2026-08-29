import { env } from "../config/env.js";
import { httpError } from "../errors/httpError.js";

export type InstacartLineItem = { name: string; quantity: number; unit: "each" };
const apiOrigin = env.INSTACART_API_ENV === "production" ? "https://connect.instacart.com" : "https://connect.dev.instacart.tools";

function requireProvider() {
  if (env.LIVE_SHOPPING_ENABLED !== "true" || env.HOSTED_SHOPPING_CHECKOUT_ENABLED !== "true") throw httpError(503, "Hosted shopping is not enabled for this environment.", "hosted_shopping_disabled");
  if (!env.INSTACART_API_KEY) throw httpError(503, "The Instacart provider is not configured.", "instacart_not_configured");
}

export async function createInstacartShoppingPage(input: { title: string; items: InstacartLineItem[]; expiresInDays: number; linkbackUrl?: string }) {
  requireProvider();
  const controller = new globalThis.AbortController();
  const timer = setTimeout(() => controller.abort(), env.SHOPPING_PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiOrigin}/idp/v1/products/products_link`, {
      method: "POST",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${env.INSTACART_API_KEY}` },
      body: JSON.stringify({
        title: input.title,
        link_type: "shopping_list",
        expires_in: input.expiresInDays,
        line_items: input.items.map((item) => ({ name: item.name, line_item_measurements: [{ quantity: item.quantity, unit: item.unit }] })),
        ...(input.linkbackUrl ? { landing_page_configuration: { partner_linkback_url: input.linkbackUrl } } : {})
      })
    });
    if (!response.ok) throw httpError(response.status === 429 ? 503 : 502, "Instacart could not create the shopping page.", response.status === 429 ? "instacart_rate_limited" : "instacart_provider_error");
    const body = await response.json() as { products_link_url?: unknown };
    if (typeof body.products_link_url !== "string") throw httpError(502, "Instacart returned an invalid shopping-page response.", "invalid_instacart_response");
    const url = new URL(body.products_link_url);
    if (url.protocol !== "https:" || !(url.hostname === "instacart.com" || url.hostname.endsWith(".instacart.com"))) throw httpError(502, "Instacart returned a non-allowlisted shopping-page URL.", "invalid_instacart_url");
    return url.toString();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw httpError(504, "Instacart timed out while creating the shopping page.", "instacart_timeout");
    throw error;
  } finally { clearTimeout(timer); }
}
