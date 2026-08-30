export type DesktopAuthCallback =
  | { kind: "success"; code: string; mode?: "recovery" }
  | { kind: "error"; code: string; description: string }
  | { kind: "incomplete" };

function callbackParams(value: string) {
  const url = new URL(value, "https://desktop-auth.invalid");
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  return { query: url.searchParams, fragment };
}

export function parseDesktopAuthCallback(value: string): DesktopAuthCallback {
  try {
    const { query, fragment } = callbackParams(value);
    const code = query.get("code");
    if (code) return query.get("mode") === "recovery" ? { kind: "success", code, mode: "recovery" } : { kind: "success", code };

    const errorCode = query.get("error_code") ?? fragment.get("error_code")
      ?? query.get("error") ?? fragment.get("error");
    const description = query.get("error_description") ?? fragment.get("error_description");
    if (errorCode || description) {
      return {
        kind: "error",
        code: errorCode ?? "authentication_failed",
        description: description?.replace(/\+/g, " ") ?? "This sign-in link could not be used."
      };
    }
  } catch {
    // The caller renders the safe incomplete-link recovery state.
  }
  return { kind: "incomplete" };
}

export function desktopDeepLink(code: string, mode?: "recovery") {
  return `ai-agent-hub://auth/callback?code=${encodeURIComponent(code)}${mode ? `&mode=${mode}` : ""}`;
}

export function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("expired") || normalized.includes("otp_expired")) {
    return "That link has expired or was already replaced. Request a new link below and open only the newest email.";
  }
  if (normalized.includes("rate limit")) {
    return "Too many links were requested recently. Wait a few minutes, then try again.";
  }
  if (normalized.includes("invalid login credentials")) {
    return "That email or password was not accepted.";
  }
  return message || "Sign-in could not be completed. Please try again.";
}
