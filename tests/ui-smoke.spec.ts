import { expect, test } from "playwright/test";

test("loads dashboard and exercises safe primary UI flows", async ({ page }) => {
  const consoleIssues: string[] = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleIssues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleIssues.push(`pageerror: ${error.message}`);
  });

  await page.goto("/");
  await expect(page).toHaveTitle("AI Agent Hub");
  await expect(page.getByRole("heading", { name: "Personal AI Operating System" })).toBeVisible();
  await expect(page.getByText("live")).toBeVisible();

  await page.getByRole("button", { name: "Information Vault" }).click();
  await expect(page.getByRole("button", { name: "Information Vault" })).toHaveClass(/nav-active/);
  await expect(page.locator("#vault").getByText("Travel Records", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Access Clearance" }).click();
  await expect(page.getByRole("button", { name: "Access Clearance" })).toHaveClass(/nav-active/);
  await expect(page.locator("#clearance").getByText("Financial Preferences", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Activity Log" }).click();
  await expect(page.getByRole("button", { name: "Activity Log" })).toHaveClass(/nav-active/);
  await expect(page.getByText("Cryptographic Activity Log")).toBeVisible();

  await page.getByRole("button", { name: "Agents" }).click();
  await expect(page.getByRole("button", { name: "Agents" })).toHaveClass(/nav-active/);
  await page.getByRole("button", { name: "The Banker Financial / Trust 81" }).click();
  await expect(page.getByRole("heading", { name: "The Banker" })).toBeVisible();

  await page.getByRole("button", { name: "Simulate vault.search" }).click();
  await expect(page.getByText("\"status\": \"ok\"")).toBeVisible();

  expect(consoleIssues).toEqual([]);
});
