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
  await expect(page.getByRole("heading", { name: "Your AI helpers are protected" })).toBeVisible();
  await expect(page.getByText("live")).toBeVisible();
  const nav = page.locator(".nav-rail");

  await page.locator(".quick-start-panel").getByRole("button", { name: "Travel planner" }).click();
  const guidedSetup = page.locator(".guided-setup-panel");
  await expect(guidedSetup).toBeVisible();
  await guidedSetup.getByRole("button", { name: "Next" }).click();
  await guidedSetup.getByLabel("Frequent Flyer Ledger note").fill("Smoke onboarding note: aisle seat, vegetarian meal, and approval before non-refundable bookings.");
  await guidedSetup.getByRole("button", { name: "Next" }).click();
  await expect(guidedSetup).toContainText("Plan a weekend trip using my preferences");
  await guidedSetup.getByRole("button", { name: "Create helper" }).click();
  await expect(page.locator("#clearance")).toContainText("Permissions");
  await expect(page.locator("#clearance")).toContainText("Frequent Flyer Ledger");

  await nav.getByRole("button", { name: "Private Info", exact: true }).click();
  await expect(nav.getByRole("button", { name: "Private Info", exact: true })).toHaveClass(/nav-active/);
  await expect(page.locator("#vault")).toContainText("Private Info");
  await expect(page.locator("#vault")).toContainText("Travel planner starter note");

  await nav.getByRole("button", { name: "Permissions", exact: true }).click();
  await expect(nav.getByRole("button", { name: "Permissions", exact: true })).toHaveClass(/nav-active/);
  await expect(page.locator("#clearance").getByText("Financial Preferences", { exact: true })).toBeVisible();

  const vaultTitle = `Smoke Vault Item ${Date.now()}`;
  await page.getByRole("button", { name: "Add Private Info" }).click();
  const addVaultForm = page.locator(".add-vault-panel");
  await expect(addVaultForm).toBeVisible();
  await addVaultForm.getByLabel("Title").fill(vaultTitle);
  await addVaultForm.getByLabel("Category").selectOption({ label: "Financial Preferences" });
  await addVaultForm.getByLabel("Private note").fill("Smoke test preference: use the low-risk card and require approval above 250 dollars.");
  await addVaultForm.getByRole("button", { name: "Save info" }).click();
  await expect(page.locator("#vault").getByText(vaultTitle, { exact: true })).toBeVisible();

  await nav.getByRole("button", { name: "Agent Hub", exact: true }).click();
  await expect(nav.getByRole("button", { name: "Agent Hub", exact: true })).toHaveClass(/nav-active/);

  await expect(page.getByText("Agent Hub Marketplace")).toBeVisible();
  await page.getByLabel("Search marketplace agents").fill("Banker");
  const bankerCard = page.locator(".marketplace-card").filter({ hasText: "The Banker" }).first();
  await expect(bankerCard).toBeVisible();
  await bankerCard.getByRole("button", { name: "Details" }).click();
  const marketplaceDetail = page.locator(".marketplace-detail");
  await expect(marketplaceDetail).toContainText("The Banker");
  const installButton = marketplaceDetail.getByRole("button", { name: /Add to profile|Added to profile/ });
  if (await installButton.isEnabled()) {
    await installButton.click();
  }
  await expect(marketplaceDetail.getByRole("button", { name: "Added to profile" })).toBeVisible();
  await page.getByLabel("Search marketplace agents").clear();

  const agentName = `Smoke Agent ${Date.now()}`;

  await page.getByRole("button", { name: "Add AI Helper" }).click();
  const addAgentForm = page.locator(".add-agent-panel");
  await expect(addAgentForm).toBeVisible();
  await addAgentForm.getByRole("button", { name: /Money helper/ }).click();
  await addAgentForm.getByRole("button", { name: "Next" }).click();
  await addAgentForm.getByLabel("Agent name").fill(agentName);
  await addAgentForm.getByLabel("What should it help with?").fill("Smoke test agent for vault search and approval regression coverage.");
  await addAgentForm.getByRole("button", { name: "Next" }).click();
  await addAgentForm.getByLabel("Take actions").check();
  await addAgentForm.getByRole("button", { name: "Next" }).click();
  await addAgentForm.getByLabel("Ask me before").fill("transfer_funds");
  await addAgentForm.getByRole("button", { name: "Add agent" }).click();
  await expect(page.getByRole("heading", { name: agentName })).toBeVisible();
  await expect(page.locator(".audit-panel")).toContainText("was added");
  await expect(page.locator(".permission-review")).toContainText("0 of 1 info categories allowed");
  await page.getByRole("button", { name: "Allow requested info" }).click();
  await expect(page.locator(".permission-review")).toContainText("1 of 1 info categories allowed");
  await expect(page.locator(".audit-panel")).toContainText("was granted access");

  await nav.getByRole("button", { name: "Private Info", exact: true }).click();
  await page.getByPlaceholder("Search personal info through the selected agent...").fill(vaultTitle);
  await page.getByRole("button", { name: "Search Info" }).click();
  await expect(page.locator(".search-results")).toContainText("Financial Preferences");

  await nav.getByRole("button", { name: "Agent Hub", exact: true }).click();
  await expect(page.getByText("Use This Agent")).toBeVisible();
  await page.getByPlaceholder("Ask it to find info or try an action that may need approval...").fill("Find my approval threshold");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".chat-transcript")).toContainText("Found");
  await expect(page.locator(".conversation-note")).toContainText("Conversation:");
  await page.getByPlaceholder("Ask it to find info or try an action that may need approval...").fill("Book a non-refundable trip");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".chat-transcript")).toContainText("approval");

  const uploadTitle = `Smoke Upload ${Date.now()}`;
  await page.locator(".topbar .upload-button input").setInputFiles({
    name: `${uploadTitle}.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from("Uploaded smoke vault note with a reusable approval phrase.")
  });
  await expect(page.locator("#vault").getByText(uploadTitle, { exact: true })).toBeVisible();

  const uploadedDocument = page.locator(".doc-row").filter({ hasText: uploadTitle }).first();
  await uploadedDocument.getByRole("button", { name: "Edit" }).click();
  await page.locator(".add-vault-panel").getByLabel("Title").fill(`${uploadTitle} Edited`);
  await page.locator(".add-vault-panel").getByRole("button", { name: "Update info" }).click();
  await expect(page.locator("#vault").getByText(`${uploadTitle} Edited`, { exact: true })).toBeVisible();

  await page.locator(".doc-row").filter({ hasText: `${uploadTitle} Edited` }).first().getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete note" }).click();
  await expect(page.locator("#vault").getByText(`${uploadTitle} Edited`, { exact: true })).toBeHidden();

  await nav.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(nav.getByRole("button", { name: "Activity", exact: true })).toHaveClass(/nav-active/);
  await expect(page.locator("#activity").getByText("Recent Activity")).toBeVisible();
  await expect(page.locator(".audit-panel")).toContainText("changed personal info");

  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator("#settings")).toContainText("Settings");

  await nav.getByRole("button", { name: "Agent Hub", exact: true }).click();
  await page.getByRole("button", { name: "Search personal info" }).click();
  await expect(page.locator(".hitl-panel")).toContainText(/Found|Blocked/);

  expect(consoleIssues).toEqual([]);
});

test("mobile layout keeps the app simple and tab-focused", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Your AI helpers are protected" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your AI helpers", exact: true })).toBeVisible();
  await expect(page.locator(".mobile-home")).toBeVisible();
  const nav = page.locator(".nav-rail");
  await page.locator(".mobile-home").getByRole("button", { name: "Start guided setup" }).click();
  await expect(page.locator(".guided-setup-panel")).toBeVisible();
  await page.locator(".guided-setup-panel").getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".mobile-home")).toBeVisible();
  await nav.getByRole("button", { name: "Agent Hub", exact: true }).click();
  await expect(page.locator(".agent-list")).toBeVisible();
  await expect(page.locator("#vault")).toBeHidden();

  await nav.getByRole("button", { name: "Private Info", exact: true }).click();
  await expect(page.locator("#vault")).toBeVisible();
  await expect(page.locator(".detail-panel")).toBeHidden();
  await expect(page.locator("#vault").getByRole("button", { name: "Add Private Info" })).toBeVisible();

  await nav.getByRole("button", { name: "Permissions", exact: true }).click();
  await expect(page.locator("#clearance")).toBeVisible();
  await expect(page.locator(".hitl-panel")).toBeVisible();
  await expect(page.locator("#vault")).toBeHidden();

  await nav.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.locator(".audit-panel")).toBeVisible();
  await expect(page.locator("#clearance")).toBeHidden();

  await nav.getByRole("button", { name: "Agent Hub", exact: true }).click();
  await page.getByRole("button", { name: "Add AI Helper" }).first().click();
  await expect(page.locator(".add-agent-panel")).toBeVisible();
  await expect(page.getByRole("heading", { name: "What kind of helper do you want?" })).toBeVisible();
});
