export type RootSurface = "public" | "auth" | "workspace" | "desktop-auth";

const publicExact = new Set(["/", "/agents", "/how-it-works", "/privacy", "/security", "/download"]);
const authExact = new Set(["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"]);
const legacyWorkspace = new Map([
  ["/discover", "/app/discover"], ["/private-data", "/app/private-data"], ["/approvals", "/app/approvals"],
  ["/activity", "/app/activity"], ["/settings", "/app/settings"], ["/creator", "/app/creator"],
  ["/operator/review", "/app/operator/review"], ["/operator/operations", "/app/operator/operations"], ["/operator/beta", "/app/operator/beta"]
]);

export function isDesktopRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function resolveRootRoute(pathname: string): { surface: RootSurface; redirect?: string } {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (path === "/desktop-auth") return { surface: "desktop-auth" };
  if (isDesktopRuntime()) return { surface: "workspace", redirect: path.startsWith("/app") ? undefined : "/app" };
  const legacy = legacyWorkspace.get(path);
  if (legacy) return { surface: "workspace", redirect: legacy };
  if (path.startsWith("/app")) return { surface: "workspace" };
  if (authExact.has(path)) return { surface: "auth" };
  if (publicExact.has(path) || path.startsWith("/agents/")) return { surface: "public" };
  return { surface: "public" };
}

export function safeReturnPath(value: string | null | undefined, fallback = "/app") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const origin = typeof window === "undefined" ? "https://local.invalid" : window.location.origin;
    const url = new URL(value, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
