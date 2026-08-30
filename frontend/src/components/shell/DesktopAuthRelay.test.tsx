import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopAuthRelay } from "./DesktopAuthRelay";

describe("DesktopAuthRelay", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders a useful expired-link recovery form", () => {
    vi.stubGlobal("window", { location: { href: "https://example.test/desktop-auth#error_code=otp_expired&error_description=Email+link+has+expired", origin: "https://example.test" } });
    const html = renderToStaticMarkup(<DesktopAuthRelay />);
    expect(html).toContain("That link has expired");
    expect(html).toContain("Send me a new link");
  });

  it("offers to open the desktop app after verification", () => {
    vi.stubGlobal("window", { location: { href: "https://example.test/desktop-auth?code=abc", origin: "https://example.test" }, setTimeout: vi.fn(), clearTimeout: vi.fn() });
    const html = renderToStaticMarkup(<DesktopAuthRelay />);
    expect(html).toContain("Email verified");
    expect(html).toContain("ai-agent-hub://auth/callback?code=abc");
  });
});
