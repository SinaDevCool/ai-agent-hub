import type { SectionId } from "./appNavigation";

export const sectionPaths: Record<SectionId, string> = {
  home: "/",
  marketplace: "/discover",
  helpers: "/agents",
  creator: "/creator",
  moderation: "/operator/review",
  operations: "/operator/operations",
  beta: "/operator/beta",
  vault: "/private-data",
  clearance: "/approvals",
  activity: "/activity",
  settings: "/settings"
};

const legacySectionPaths: Partial<Record<string, SectionId>> = {
  "/marketplace": "marketplace",
  "/private-info": "vault",
  "/access": "clearance",
  "/moderation": "moderation",
  "/operations": "operations",
  "/beta": "beta"
};

export function sectionFromPathname(pathname: string, fallback: SectionId): SectionId {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const direct = (Object.entries(sectionPaths) as Array<[SectionId, string]>).find(([, path]) => path === normalized);
  if (direct) return direct[0];
  if (legacySectionPaths[normalized]) return legacySectionPaths[normalized] as SectionId;
  if (normalized.startsWith("/discover/")) return "marketplace";
  if (normalized.startsWith("/agents/")) return "helpers";
  if (normalized.startsWith("/approvals/")) return "clearance";
  if (normalized.startsWith("/activity/")) return "activity";
  if (normalized.startsWith("/settings/")) return "settings";
  return fallback;
}

export function pathForSection(section: SectionId) {
  return sectionPaths[section];
}
