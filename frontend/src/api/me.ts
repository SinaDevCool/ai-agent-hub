import { apiGet } from "./client";
import type { CurrentUser, CurrentUserCapabilities } from "./types";

export async function getCurrentUser() {
  return apiGet<{ user: CurrentUser; capabilities: CurrentUserCapabilities }>("/api/me");
}
