import type { MarketplaceAgent } from "../../api/types";
import type { MarketplaceMatch } from "../../lib/marketplaceMatching";

export function helperValueLine(agent: MarketplaceAgent) {
  return agent.tagline || agent.description;
}

export function helperDecisionReason(match: MarketplaceMatch, index: number) {
  const reason = match.reasons[0] ?? "Visible safety profile";
  if (index === 0) return `Best because ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`;
  return reason;
}

export function matchLabel(match: MarketplaceMatch, index: number) {
  if (index === 0) return "Best match";
  if (match.score >= 70) return "Good match";
  return "Possible match";
}

export function safetyBadges(agent: MarketplaceAgent) {
  const manifest = agent.versions[0]?.capabilityManifest ?? {};
  return [
    "Safe by default",
    manifest.highRiskActions?.length ? "Asks first" : "No risky actions",
    manifest.requestedSchemas?.length ? "Uses private info" : "No info needed"
  ];
}
