import { env } from "../config/env.js";
import { getBetaAccess } from "./betaService.js";

export type CapabilityReleaseLevel = "discover" | "read" | "prepare" | "redirect" | "transact" | "cancel" | "reconcile";

type Rules = { cohorts?: Record<string, CapabilityReleaseLevel[]>; users?: Record<string, CapabilityReleaseLevel[]> };

function rules(): Rules {
  try { return JSON.parse(env.BETA_CAPABILITY_RULES) as Rules; } catch { return {}; }
}

export function releaseLevelForAction(action: string): CapabilityReleaseLevel {
  if (["search", "status"].includes(action)) return "read";
  if (["quote", "prepare_action"].includes(action)) return "prepare";
  if (["reserve", "execute_action"].includes(action)) return "transact";
  if (action === "cancel") return "cancel";
  if (action === "sync_status") return "reconcile";
  return "discover";
}

export async function isBetaCapabilityAllowed(userId: string, level: CapabilityReleaseLevel) {
  if (env.PRIVATE_BETA_ENFORCED !== "true") return true;
  const access = await getBetaAccess(userId);
  if (!access?.allowed) return false;
  const configured = rules();
  const levels = configured.users?.[userId] ?? (access.cohort ? configured.cohorts?.[access.cohort] : undefined) ?? ["discover", "read", "prepare"];
  return levels.includes(level);
}
