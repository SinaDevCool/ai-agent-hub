import net from "node:net";
import { URL } from "node:url";

function privateIpReason(hostname: string) {
  const ipVersion = net.isIP(hostname);
  if (!ipVersion) return null;
  if (hostname === "0.0.0.0" || hostname === "::" || hostname === "::1") return "Loopback and unspecified IP addresses are blocked.";
  if (hostname.startsWith("127.")) return "Loopback IP addresses are blocked.";
  if (hostname.startsWith("10.")) return "Private network IP addresses are blocked.";
  if (/^192\.168\./.test(hostname)) return "Private network IP addresses are blocked.";
  const match172 = hostname.match(/^172\.(\d{1,3})\./);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return "Private network IP addresses are blocked.";
  if (/^169\.254\./.test(hostname)) return "Link-local and cloud metadata IP addresses are blocked.";
  if (ipVersion === 6) {
    const normalized = hostname.toLowerCase();
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return "Private network IPv6 addresses are blocked.";
    if (normalized.startsWith("fe80")) return "Link-local IPv6 addresses are blocked.";
  }
  return null;
}

export function validateExternalUrl(endpointUrl?: string) {
  if (!endpointUrl) return { allowed: false as const, reason: "External endpoint URL is missing." };
  let url: URL;
  try {
    url = new URL(endpointUrl);
  } catch {
    return { allowed: false as const, reason: "External endpoint URL is invalid." };
  }
  if (url.protocol !== "https:") {
    return { allowed: false as const, reason: "External endpoints must use HTTPS." };
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { allowed: false as const, reason: "Localhost endpoints are blocked." };
  }
  if (hostname === "metadata.google.internal") {
    return { allowed: false as const, reason: "Cloud metadata endpoints are blocked." };
  }
  const ipReason = privateIpReason(hostname);
  if (ipReason) return { allowed: false as const, reason: ipReason };
  return { allowed: true as const, url };
}
