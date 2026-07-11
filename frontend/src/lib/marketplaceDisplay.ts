import type { MarketplaceAgent } from "../api/types";

export function marketplaceExamplePrompts(agent: MarketplaceAgent | undefined) {
  const manifest = agent?.versions[0]?.capabilityManifest ?? {};
  if (manifest.examplePrompts?.length) return manifest.examplePrompts.slice(0, 3);
  const category = agent?.category.toLowerCase() ?? "";
  if (category.includes("travel")) return ["Plan a weekend trip", "Check my travel preferences", "Ask before booking anything"];
  if (category.includes("financial")) return ["Find my budget rules", "Compare card preferences", "Ask before moving money"];
  if (category.includes("wellness")) return ["Summarize health notes", "Check what you can access", "Ask before sharing health info"];
  if (category.includes("executive")) return ["Draft a follow-up", "Summarize my reminders", "Ask before sending"];
  return ["Find useful private info", "Help with this task", "Ask before risky actions"];
}

export function marketplaceTrustReasons(agent: MarketplaceAgent | undefined) {
  const manifest = agent?.versions[0]?.capabilityManifest ?? {};
  if (manifest.trustReasons?.length) return manifest.trustReasons.slice(0, 4);
  const reasons = [
    agent?.creator?.verified ? "Verified creator profile" : "Community listing with a visible safety profile",
    "Cannot read private info until you allow it",
    "You can remove this helper or revoke access anytime"
  ];
  if (manifest.highRiskActions?.length) {
    reasons.splice(2, 0, "Must ask before sensitive actions");
  } else {
    reasons.splice(2, 0, "No listed risky actions");
  }
  return reasons;
}
