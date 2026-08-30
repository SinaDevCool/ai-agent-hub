import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuthSignInScreen, type AuthMode } from "./AuthScreens";

function render(authMode: AuthMode) {
  return renderToStaticMarkup(<AuthSignInScreen authMessage="" authMode={authMode} email="person@example.com" password="" confirmPassword="" isSubmitting={false} onEmailChange={vi.fn()} onPasswordChange={vi.fn()} onConfirmPasswordChange={vi.fn()} onModeChange={vi.fn()} onSubmit={vi.fn()} />);
}

describe("AuthSignInScreen", () => {
  it("uses email and password for returning users", () => { expect(render("sign-in")).toContain("Welcome back"); expect(render("sign-in")).toContain('type="password"'); expect(render("sign-in")).not.toContain("magic link"); });
  it("explains that verification happens once during account creation", () => { expect(render("sign-up")).toContain("Create your account"); expect(render("sign-up")).toContain("verify your email"); expect(render("sign-up")).toContain("Confirm password"); });
  it("provides recovery and new-password states", () => { expect(render("forgot-password")).toContain("Send recovery email"); expect(render("reset-password")).toContain("Choose a new password"); });
  it("says normal sign-in no longer requires email links", () => { expect(render("verify-email")).toContain("Check your inbox once"); expect(render("verify-email")).toContain("will not need an email link"); });
});
