import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "playwright/test";

async function expectNoSeriousViolations(page: Page, context: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const violations = result.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""));
  expect(violations.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })), context }))).toEqual([]);
}

test("primary desktop and settings surfaces have no serious automated WCAG violations", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("ai-agent-hub-user-id", `a11y-${Date.now()}`);
    if (!window.localStorage.getItem("ai-agent-hub-theme")) {
      window.localStorage.setItem("ai-agent-hub-theme", "dark");
    }
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What do you want help with today?" })).toBeVisible();
  await expectNoSeriousViolations(page, "home");
  const themeButton = page.getByRole("button", { name: /Switch to (dark|light) theme/ });
  await themeButton.click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toMatch(/dark|light/);
  await expectNoSeriousViolations(page, "home-alternate-theme");
  const selectedTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(selectedTheme);
  await page.locator(".nav-rail").getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.locator("#settings")).toBeVisible();
  await expectNoSeriousViolations(page, "settings");
});

test("primary mobile surface has no serious automated WCAG violations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => window.localStorage.setItem("ai-agent-hub-user-id", `a11y-mobile-${Date.now()}`));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What do you want help with first?" })).toBeVisible();
  await expectNoSeriousViolations(page, "mobile-home");
});

test("every consumer route remains readable in light mode", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    window.localStorage.setItem("ai-agent-hub-user-id", `a11y-light-${Date.now()}`);
    window.localStorage.setItem("ai-agent-hub-theme", "light");
  });

  const routes = [
    "/", "/discover", "/agents", "/approvals", "/activity", "/private-data", "/settings",
    "/creator", "/operator/review", "/operator/operations", "/operator/beta"
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("main")).toBeVisible();
    if (route === "/settings") await expect(page.locator("#settings")).toBeVisible();
    await expectNoSeriousViolations(page, `light:${route}`);
    await page.screenshot({ fullPage: true, path: test.info().outputPath(`light-${route === "/" ? "home" : route.slice(1)}.png`) });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/discover", "/agents", "/private-data", "/settings"]) {
    await page.goto(route);
    await expectNoSeriousViolations(page, `light-mobile:${route}`);
  }
});
