import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuthSignInScreen } from "./AuthScreens";

function render(isStagingPasswordSignInEnabled: boolean) {
  return renderToStaticMarkup(
    <AuthSignInScreen
      authMessage=""
      email=""
      magicLinkSentTo=""
      password=""
      isSendingMagicLink={false}
      isSigningInWithPassword={false}
      isStagingPasswordSignInEnabled={isStagingPasswordSignInEnabled}
      onEmailChange={vi.fn()}
      onPasswordChange={vi.fn()}
      onPasswordSubmit={vi.fn()}
      onResetMagicLink={vi.fn()}
      onSubmit={vi.fn()}
    />
  );
}

describe("AuthSignInScreen", () => {
  it("shows password access only for staging acceptance", () => {
    expect(render(true)).toContain("Sign in to staging");
    expect(render(true)).toContain('type="password"');
  });

  it("does not expose password access outside staging", () => {
    expect(render(false)).not.toContain("Sign in to staging");
    expect(render(false)).not.toContain('type="password"');
  });

  it("explains that sign in and sign up use the same email flow", () => {
    expect(render(false)).toContain("Sign in or create your account");
    expect(render(false)).toContain("Continue with email");
  });
});
