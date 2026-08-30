import { describe, expect, it } from "vitest";
import { desktopDeepLink, friendlyAuthError, parseDesktopAuthCallback } from "./desktopAuth";

describe("desktop authentication callbacks", () => {
  it("accepts a PKCE authorization code", () => {
    expect(parseDesktopAuthCallback("https://example.test/desktop-auth?code=abc123")).toEqual({ kind: "success", code: "abc123" });
    expect(desktopDeepLink("a b")).toBe("ai-agent-hub://auth/callback?code=a%20b");
  });

  it("reads Supabase errors from the URL fragment", () => {
    expect(parseDesktopAuthCallback("https://example.test/desktop-auth#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")).toEqual({
      kind: "error",
      code: "otp_expired",
      description: "Email link is invalid or has expired"
    });
  });

  it("provides useful recovery copy", () => {
    expect(friendlyAuthError("Email link has expired")).toContain("new link");
    expect(friendlyAuthError("email rate limit exceeded")).toContain("Wait");
  });
});
