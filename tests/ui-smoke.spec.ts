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

  const vaultTitle = `Smoke Vault Item ${Date.now()}`;
  await page.getByRole("button", { name: "Add Vault Item" }).click();
  const addVaultForm = page.locator(".add-vault-panel");
  await expect(addVaultForm).toBeVisible();
  await addVaultForm.getByLabel("Title").fill(vaultTitle);
  await addVaultForm.getByLabel("Schema").selectOption({ label: "Financial Preferences" });
  await addVaultForm.getByLabel("Content").fill("Smoke test preference: use the low-risk card and require approval above 250 dollars.");
  await addVaultForm.getByRole("button", { name: "Save vault item" }).click();
  await expect(page.locator("#vault").getByText(vaultTitle, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Activity Log" }).click();
  await expect(page.getByRole("button", { name: "Activity Log" })).toHaveClass(/nav-active/);
  await expect(page.getByText("Cryptographic Activity Log")).toBeVisible();
  await expect(page.locator(".audit-panel")).toContainText("vault_write");

  await page.getByRole("button", { name: "Agents" }).click();
  await expect(page.getByRole("button", { name: "Agents" })).toHaveClass(/nav-active/);
  const agentName = `Smoke Agent ${Date.now()}`;

  await page.getByRole("button", { name: "Add Agent" }).click();
  const addAgentForm = page.locator(".add-agent-panel");
  await expect(addAgentForm).toBeVisible();
  await addAgentForm.getByLabel("Name").fill(agentName);
  await addAgentForm.getByLabel("Category").selectOption("Financial");
  await addAgentForm.getByLabel("Description").fill("Smoke test agent for vault search and approval regression coverage.");
  await addAgentForm.getByLabel("action.execute").check();
  await addAgentForm.getByLabel("Financial Preferences").check();
  await addAgentForm.getByLabel("High-Risk Actions").fill("transfer_funds");
  await addAgentForm.getByRole("button", { name: "Create agent" }).click();
  await expect(page.getByRole("heading", { name: agentName })).toBeVisible();
  await expect(page.locator(".audit-panel")).toContainText("agent_created");
  await expect(page.locator(".permission-review")).toContainText("1 requested / 0 granted");
  await page.getByRole("button", { name: "Grant requested access" }).click();
  await expect(page.locator(".permission-review")).toContainText("1 requested / 1 granted");
  await expect(page.locator(".audit-panel")).toContainText("permission_requested");

  await page.getByRole("button", { name: "The Banker Financial / Trust 81" }).click();
  await expect(page.getByRole("heading", { name: "The Banker" })).toBeVisible();

  await page.getByRole("button", { name: "Simulate vault.search" }).click();
  await expect(page.getByText("\"status\": \"ok\"")).toBeVisible();

  expect(consoleIssues).toEqual([]);
});
