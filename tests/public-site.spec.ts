import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";

test("public landing explains the product without authentication", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /personal team of AI agents/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore agents/ }).first()).toBeVisible();
  await expect(page.getByText("Local only", { exact: true })).toBeVisible();
  await expect(page.getByText("Cloud assisted", { exact: true })).toBeVisible();
  await expect(page.getByText(/No local GGUF model execution/)).toBeVisible();
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze()).violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""));
  expect(violations).toEqual([]);
});

test("public marketplace supports search and agent details", async ({ page }) => {
  await page.goto("/agents");
  await expect(page.getByRole("heading", { name: "Find an agent for everyday life" })).toBeVisible();
  const cards = page.locator(".public-agent-card");
  await expect(cards.first()).toBeVisible();
  const firstName = await cards.first().getByRole("heading").innerText();
  await page.getByLabel("Search agents").fill(firstName);
  await expect(cards).toHaveCount(1);
  await cards.first().getByRole("link", { name: /View agent/ }).click();
  await expect(page.getByRole("heading", { name: firstName })).toBeVisible();
  await expect(page.getByRole("link", { name: /Add to my hub/ })).toHaveAttribute("href", /\/signup\?returnTo=/);
});

test("public mobile navigation remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Privacy", exact: true })).toBeVisible();
});

test("desktop connector completion remains public and actionable", async ({ page }) => {
  await page.goto("/connections/complete?connector=success&provider=microsoft&message=Microsoft%20connected.");
  await expect(page.getByRole("heading", { name: "Microsoft is connected" })).toBeVisible();
  await expect(page.getByText("Return to the desktop app", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open web settings" })).toHaveAttribute("href", "/app/settings?view=connections");
});
