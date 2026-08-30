import type { SectionId } from "./appNavigation";

export const sectionPaths: Record<SectionId, string> = {
  home: "/app",
  marketplace: "/app/discover",
  helpers: "/app/agents",
  creator: "/app/creator",
  moderation: "/app/operator/review",
  operations: "/app/operator/operations",
  beta: "/app/operator/beta",
  vault: "/app/private-data",
  clearance: "/app/approvals",
  activity: "/app/activity",
  settings: "/app/settings"
};

const legacySectionPaths: Partial<Record<string, SectionId>> = {
  "/discover": "marketplace",
  "/marketplace": "marketplace",
  "/private-data": "vault",
  "/private-info": "vault",
  "/approvals": "clearance",
  "/access": "clearance",
  "/activity": "activity",
  "/settings": "settings",
  "/creator": "creator",
  "/moderation": "moderation",
  "/operations": "operations",
  "/beta": "beta"
};

export function sectionFromPathname(pathname: string, fallback: SectionId): SectionId {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const direct = (Object.entries(sectionPaths) as Array<[SectionId, string]>).find(([, path]) => path === normalized);
  if (direct) return direct[0];
  if (legacySectionPaths[normalized]) return legacySectionPaths[normalized] as SectionId;
  if (normalized.startsWith("/app/discover/")) return "marketplace";
  if (normalized.startsWith("/app/agents/")) return "helpers";
  if (normalized.startsWith("/app/approvals/")) return "clearance";
  if (normalized.startsWith("/app/activity/")) return "activity";
  if (normalized.startsWith("/app/settings/")) return "settings";
  return fallback;
}

export function pathForSection(section: SectionId) {
  return sectionPaths[section];
}
