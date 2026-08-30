import { expect, test } from "playwright/test";

test("expired desktop email links show an actionable recovery flow", async ({ page }) => {
  await page.goto("/desktop-auth#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");

  await expect(page.getByRole("heading", { name: "That link has expired" })).toBeVisible();
  await expect(page.getByText("Request a new link below")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send me a new link" })).toBeVisible();
});

test("successful desktop callbacks offer the registered app handoff", async ({ page }) => {
  await page.goto("/desktop-auth?code=test-code");

  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open AI Agent Hub" })).toHaveAttribute(
    "href",
    "ai-agent-hub://auth/callback?code=test-code"
  );
});

test("password recovery callbacks preserve recovery mode for desktop", async ({ page }) => {
  await page.goto("/desktop-auth?mode=recovery&code=reset-code");
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open AI Agent Hub" })).toHaveAttribute("href", "ai-agent-hub://auth/callback?code=reset-code&mode=recovery");
});
