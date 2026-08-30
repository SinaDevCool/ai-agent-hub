import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("ai-agent-hub-user-id", `ui-contract-${Date.now()}`);
  });
});

test("consumer navigation is deep-linkable and every visible control has a name", async ({ page }) => {
  await page.goto("/app/discover");
  const navigation = page.locator(".nav-rail nav").first();
  const expectedLinks = [
    ["Home", "/app"],
    ["Discover", "/app/discover"],
    ["My Agents", "/app/agents"],
    ["Approvals", "/app/approvals"],
    ["Activity", "/app/activity"],
    ["Private Data", "/app/private-data"],
    ["Settings", "/app/settings"]
  ] as const;

  for (const [name, href] of expectedLinks) {
    await expect(navigation.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }

  const unnamedButtons = await page.getByRole("button").evaluateAll((buttons) => buttons.filter((button) => !(button.getAttribute("aria-label") || button.textContent?.trim() || button.getAttribute("title"))).length);
  expect(unnamedButtons).toBe(0);

  await navigation.getByRole("link", { name: "Approvals", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/approvals$/);
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
  await navigation.getByRole("link", { name: "Activity", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/activity$/);
  await navigation.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/settings$/);
});

test("Discover primary interactions provide visible feedback", async ({ page }) => {
  await page.goto("/app/discover");

  await page.getByRole("button", { name: "Safe travel planning" }).click();
  await expect(page.getByLabel("Search marketplace agents")).toHaveValue("travel");
  await expect(page.getByLabel("Filter marketplace category")).toHaveValue("Travel");
  await expect(page).toHaveURL(/category=Travel/);

  await page.getByRole("button", { name: "Help me choose" }).click();
  await expect(page.locator(".agent-match-panel")).toBeVisible();
  await page.getByRole("button", { name: "More filters" }).click();
  await expect(page.locator(".marketplace-options-panel")).toBeVisible();

  await page.getByLabel("Search marketplace agents").fill("");
  const firstCard = page.locator(".marketplace-card").first();
  await firstCard.getByRole("button", { name: /View details/ }).click();
  const details = page.getByRole("dialog", { name: /.+/ });
  await expect(details).toBeVisible();
  await details.getByRole("button", { name: "Close" }).click();
  await expect(details).toBeHidden();

  const themeToggle = page.locator(".theme-toggle");
  const initialTheme = await page.locator("html").getAttribute("data-theme");
  await themeToggle.click();
  const expectedTheme = initialTheme === "dark" ? "light" : "dark";
  await expect(page.locator("html")).toHaveAttribute("data-theme", expectedTheme);
  await expect(themeToggle).toHaveAttribute("aria-label", `Switch to ${expectedTheme === "dark" ? "light" : "dark"} theme`);
});

test("Settings tabs use stable URLs and mobile navigation remains compact", async ({ page }) => {
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/connections$/);
  await page.getByRole("button", { name: "Local AI", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/local-ai$/);
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(page.getByRole("button", { name: "Light", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dark", exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/discover");
  await expect(page.locator(".nav-rail .nav-item-group > a:visible")).toHaveCount(5);
  await expect(page.getByRole("link", { name: "AI Agent Hub home" })).toBeVisible();
});
