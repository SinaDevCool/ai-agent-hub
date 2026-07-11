import { expect, test } from "playwright/test";

test("loads dashboard and exercises safe primary UI flows", async ({ page }) => {
  const consoleIssues: string[] = [];
  const smokeUserId = `ui-clean-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await page.addInitScript((userId) => {
    window.localStorage.setItem("ai-agent-hub-user-id", userId);
  }, smokeUserId);

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleIssues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleIssues.push(`pageerror: ${error.message}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("/api/")) {
      consoleIssues.push(`response: ${response.status()} ${response.url()}`);
    }
  });

  await page.goto("/");
  await expect(page).toHaveTitle("AI Agent Hub");
  await expect(page.getByRole("heading", { name: "What do you want help with today?" })).toBeVisible();
  await expect(page.locator(".connection-status").getByText("live", { exact: true })).toBeVisible();
  consoleIssues.length = 0;
  const nav = page.locator(".nav-rail");

  const firstRunTravelChoice = page.getByTestId("onboarding-need-travel");
  await expect(firstRunTravelChoice).toBeVisible();
  await nav.getByRole("button", { name: "My Agents", exact: true }).click();
  await expect(page.locator("#helpers")).toContainText("No agents yet");
  await nav.getByRole("button", { name: "Private Info", exact: true }).click();
  await expect(page.locator("#vault")).toContainText("No saved info yet");
  await nav.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.locator("#activity")).toContainText("No activity yet");
  await nav.getByRole("button", { name: "Home", exact: true }).click();
  await firstRunTravelChoice.click();
  await expect(nav.getByRole("button", { name: "Agent Pool", exact: true })).toHaveClass(/nav-active/);
  await expect(page.locator(".marketplace-recommendation-banner")).toContainText("Showing agents for Plan a trip");
  await expect(page.getByLabel("Search marketplace agents")).toHaveValue("travel");
  await nav.getByRole("button", { name: "Home", exact: true }).click();
  await page.locator(".home-category-grid").getByRole("button", { name: /Plan a trip/ }).click();
  await expect(nav.getByRole("button", { name: "Agent Pool", exact: true })).toHaveClass(/nav-active/);
  await expect(page.locator(".marketplace-recommendation-banner")).toContainText("Showing agents for Plan a trip");
  await expect(page.getByLabel("Search marketplace agents")).toHaveValue("travel");

  await nav.getByRole("button", { name: "Private Info", exact: true }).click();
  await expect(nav.getByRole("button", { name: "Private Info", exact: true })).toHaveClass(/nav-active/);
  await expect(page.locator("#vault")).toContainText("Private Info");
  await expect(page.locator("#vault select option").filter({ hasText: /safety-|creator-|marketplace-|lifecycle-|smoke|test|demo|sample|qa/i })).toHaveCount(0);

  await expect(nav.getByRole("button", { name: "Permissions", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Creator Studio", exact: true })).toHaveCount(0);
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Creator Studio" })).toHaveCount(0);
  await expect(page.locator("#settings")).toContainText("Manage your account, saved info access, and data export.");
  await expect(page.getByRole("button", { name: "Manage access" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export my data" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove all agent access" })).toBeVisible();
  await expect(page.locator("#settings")).toContainText("Request creator access when you are ready.");
  await page.getByLabel("What do you want to publish?").fill("I want to publish safe travel agents that ask before booking.");
  await page.getByRole("button", { name: "Request creator access" }).click();
  await expect(page.locator("#settings")).toContainText("Creator request pending.");
  await page.getByRole("button", { name: "Manage access" }).click();
  await expect(page.locator("#clearance")).toContainText("Access & Approvals");
  await expect(page.locator("#clearance")).toContainText("Waiting for you");
  await expect(page.locator("#clearance")).toContainText("Needs access");
  await expect(page.locator("#clearance")).toContainText("Allowed");
  await page.locator("#clearance").getByText("Other saved info", { exact: true }).click();
  await expect(page.locator("#clearance").getByText("Financial Preferences", { exact: true })).toBeVisible();

  const vaultTitle = `Smoke Vault Item ${Date.now()}`;
  await nav.getByRole("button", { name: "Private Info", exact: true }).click();
  await page.locator("#vault").getByRole("button", { name: "Add info" }).click();
  const addVaultForm = page.locator(".add-vault-panel");
  await expect(addVaultForm).toBeVisible();
  await expect(addVaultForm.locator("select option").filter({ hasText: /safety-|creator-|marketplace-|lifecycle-|smoke|test|demo|sample|qa/i })).toHaveCount(0);
  await addVaultForm.getByLabel("Name this info").fill(vaultTitle);
  await addVaultForm.getByLabel("What kind of info is it?").selectOption({ label: "Financial Preferences" });
  await addVaultForm.getByLabel("Details").fill("Smoke test preference: use the low-risk card and require approval above 250 dollars.");
  await addVaultForm.getByRole("button", { name: "Save info" }).click();
  await expect(page.locator("#vault").getByText(vaultTitle, { exact: true })).toBeVisible();

  await nav.getByRole("button", { name: "My Agents", exact: true }).click();
  await expect(nav.getByRole("button", { name: "My Agents", exact: true })).toHaveClass(/nav-active/);
  await expect(page.locator("#helpers").getByText("My Agents", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Search agents")).toBeVisible();
  await nav.getByRole("button", { name: "Agent Pool", exact: true }).click();
  await expect(nav.getByRole("button", { name: "Agent Pool", exact: true })).toHaveClass(/nav-active/);
  await expect(page.locator(".marketplace-panel").getByText("Agent Pool")).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to My Agents" })).toBeHidden();
  await page.getByRole("button", { name: "Help me choose" }).click();
  const matcher = page.locator(".agent-match-panel");
  await matcher.getByLabel("I need help with").selectOption({ label: "Money" });
  await matcher.locator("fieldset").first().getByLabel("Yes").check();
  await matcher.locator("fieldset").nth(1).getByLabel("Yes, with approval").check();
  await matcher.getByRole("button", { name: "Show matches" }).click();
  await expect(page.getByLabel("Search marketplace agents")).toHaveValue("money");
  await expect(page.locator(".marketplace-card").first()).toContainText(/Best match|Ready to use/);
  await page.getByLabel("Search marketplace agents").fill("Budget");
  const budgetCard = page.locator(".marketplace-card").filter({ hasText: "Budget Guard" }).first();
  await expect(budgetCard).toBeVisible();
  await budgetCard.getByRole("button", { name: "View Agent" }).click();
  const marketplaceDetail = page.locator(".marketplace-detail-sheet");
  await expect(marketplaceDetail).toContainText("Budget Guard");
  await expect(marketplaceDetail).toContainText("Needs access to");
  await expect(marketplaceDetail).toContainText("Why this is safe");
  const addHelperButton = marketplaceDetail.getByRole("button", { name: "Add Agent" });
  if (await addHelperButton.count()) {
    await addHelperButton.click();
    const installDialog = page.getByRole("dialog", { name: /Add Budget Guard/ });
    await installDialog.getByRole("button", { name: "Add Agent" }).click();
  }
  await expect(nav.getByRole("button", { name: "My Agents", exact: true })).toHaveClass(/nav-active/);
  await expect(page.locator("#helpers")).toContainText("Budget Guard");
  await nav.getByRole("button", { name: "Agent Pool", exact: true }).click();
  await page.getByRole("button", { name: "More options" }).click();
  await expect(page.getByRole("button", { name: "Create custom agent" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import external agent" })).toHaveCount(0);
  await page.getByLabel("Search marketplace agents").clear();

  await nav.getByRole("button", { name: "My Agents", exact: true }).click();
  await page.locator(".desktop-agent-list").getByText("Budget Guard").click();
  await page.locator(".agent-profile-tabs").getByRole("tab", { name: "Access" }).click();
  await expect(page.locator(".agent-tab-panel")).toContainText("0 of 1 requested categories allowed");
  await page.getByRole("button", { name: "Allow requested info" }).click();
  await expect(page.locator(".agent-tab-panel")).toContainText("1 of 1 requested categories allowed");
  await expect(page.locator(".audit-panel")).toContainText("can use saved info");
  await page.locator(".agent-profile-tabs").getByRole("tab", { name: "Chat" }).click();

  await nav.getByRole("button", { name: "Private Info", exact: true }).click();
  await page.getByPlaceholder("Search saved info…").fill(vaultTitle);
  await page.getByRole("button", { name: "Search info" }).click();
  await expect(page.locator(".search-results")).toContainText("Financial Preferences");

  await nav.getByRole("button", { name: "My Agents", exact: true }).click();
  await expect(page.getByText("Use This Agent")).toBeVisible();
  await page.getByPlaceholder("Ask what you want help with…").fill("Find my approval threshold");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".chat-transcript")).toContainText("Found");
  await expect(page.locator(".conversation-note")).toContainText("Conversation:");
  await page.getByPlaceholder("Ask what you want help with…").fill("Book a non-refundable trip");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".chat-transcript")).toContainText("approval");
  await page.locator(".chat-approval-banner").getByRole("button", { name: "Allow once" }).click();
  await expect(page.locator(".chat-transcript")).toContainText("completed the approved action");

  const uploadTitle = `Smoke Upload ${Date.now()}`;
  await nav.getByRole("button", { name: "Private Info", exact: true }).click();
  await page.locator("#vault").getByRole("button", { name: "More" }).click();
  await page.locator("#vault .upload-button input").setInputFiles({
    name: `${uploadTitle}.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from("Uploaded smoke vault note with a reusable approval phrase.")
  });
  await expect(page.locator("#vault").getByText(uploadTitle, { exact: true })).toBeVisible();

  const uploadedDocument = page.locator(".doc-row").filter({ hasText: uploadTitle }).first();
  await uploadedDocument.getByRole("button", { name: "Manage" }).click();
  await uploadedDocument.getByRole("button", { name: "Edit" }).click();
  await page.locator(".add-vault-panel").getByLabel("Name this info").fill(`${uploadTitle} Edited`);
  await page.locator(".add-vault-panel").getByRole("button", { name: "Update info" }).click();
  await expect(page.locator("#vault").getByText(`${uploadTitle} Edited`, { exact: true })).toBeVisible();

  const editedDocument = page.locator(".doc-row").filter({ hasText: `${uploadTitle} Edited` }).first();
  await editedDocument.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete note" }).click();
  await expect(page.locator("#vault").getByText(`${uploadTitle} Edited`, { exact: true })).toBeHidden();

  await nav.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(nav.getByRole("button", { name: "Activity", exact: true })).toHaveClass(/nav-active/);
  await expect(page.locator("#activity").getByText("Activity", { exact: true })).toBeVisible();
  await expect(page.locator(".audit-panel")).toContainText("Saved info changed");

  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator("#settings")).toContainText("Settings");
  await expect(page.getByRole("button", { name: "Open Creator Studio" })).toHaveCount(0);

  await nav.getByRole("button", { name: "My Agents", exact: true }).click();
  await page.locator(".agent-profile-tabs").getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Search personal info" }).click();
  await expect(page.locator(".hitl-panel")).toContainText(/Found|Blocked/);

  expect(consoleIssues).toEqual([]);
});

test("mobile layout keeps the app simple and tab-focused", async ({ page }) => {
  const smokeUserId = `ui-mobile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.addInitScript((userId) => {
    window.localStorage.setItem("ai-agent-hub-user-id", userId);
  }, smokeUserId);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "What do you want help with today?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What do you want help with?", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "First agent setup" })).toBeVisible();
  await expect(page.locator(".mobile-home")).toBeHidden();
  const nav = page.locator(".nav-rail");
  await expect(nav.getByRole("button", { name: "Agent Pool", exact: true })).toHaveAttribute("data-mobile-label", "Pool");
  await expect(nav.getByRole("button", { name: "My Agents", exact: true })).toHaveAttribute("data-mobile-label", "Agents");
  await expect(nav.getByRole("button")).toHaveCount(5);
  await expect(nav.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Plan a trip Flights, hotels, loyalty, itineraries" })).toBeVisible();
  await nav.getByRole("button", { name: "My Agents", exact: true }).click();
  await expect(page.locator(".agent-list")).toBeVisible();
  await expect(page.locator("#helpers")).toContainText("My Agents");
  await expect(page.locator("#vault")).toBeHidden();

  await nav.getByRole("button", { name: "Private Info", exact: true }).click();
  await expect(page.locator("#vault")).toBeVisible();
  await expect(page.locator(".detail-panel")).toBeHidden();
  await expect(page.locator("#vault select option").filter({ hasText: /safety-|creator-|marketplace-|lifecycle-|smoke|test|demo|sample|qa/i })).toHaveCount(0);
  await expect(page.locator("#vault")).toContainText("Travel preferences");
  await expect(page.locator("#vault").getByRole("button", { name: "Add info" })).toBeVisible();
  await page.locator("#vault").getByRole("button", { name: "Add info" }).click();
  await expect(page.locator(".add-vault-panel")).toBeVisible();
  await expect(page.locator(".add-vault-panel")).toContainText("Name this info");
  await expect(page.locator(".add-vault-panel")).toContainText("What kind of info is it?");
  await expect(page.locator(".add-vault-panel")).toContainText("Details");
  await expect(page.locator(".add-vault-panel select option").filter({ hasText: /safety-|creator-|marketplace-|lifecycle-|smoke|test|demo|sample|qa/i })).toHaveCount(0);

  await page.locator(".topbar").getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator("#settings")).toBeVisible();
  await expect(page.locator("#settings")).toContainText("Manage your account, saved info access, and data export.");
  await expect(page.getByRole("button", { name: "Manage access" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export my data" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove all agent access" })).toBeVisible();
  await expect(page.locator("#settings")).toContainText("Want to publish agents?");
  await expect(page.getByRole("button", { name: "Open Creator Studio" })).toHaveCount(0);
  await page.getByRole("button", { name: "Manage access" }).click();
  await expect(page.locator("#clearance")).toBeVisible();
  await expect(page.locator("#clearance")).toContainText("Access & Approvals");
  await expect(page.locator("#clearance")).toContainText("Waiting for you");
  await expect(page.locator("#clearance")).toContainText("Needs access");
  await expect(page.locator("#clearance")).toContainText("Allowed");
  await expect(page.locator(".hitl-panel")).toBeVisible();
  await expect(page.locator(".hitl-panel")).toContainText("Waiting for you");
  await expect(page.locator(".hitl-panel")).toContainText("Nothing needs your approval right now");
  await expect(page.locator("#vault")).toBeHidden();
  await expect(page.locator(".add-vault-panel")).toBeHidden();

  await nav.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.locator(".audit-panel")).toBeVisible();
  await expect(page.locator("#clearance")).toBeHidden();

  await nav.getByRole("button", { name: "Agent Pool", exact: true }).click();
  await expect(page.locator(".marketplace-panel").getByText("Agent Pool")).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to My Agents" })).toBeHidden();
  await expect(page.getByLabel("Filter marketplace category")).toBeHidden();
  const dailyTaskCard = page.locator(".marketplace-card").filter({ hasText: "Daily Task Helper" }).first();
  await expect(dailyTaskCard.getByRole("button", { name: "Add Agent" })).toBeHidden();
  await dailyTaskCard.getByRole("button", { name: "View Agent" }).click();
  const mobileSheet = page.locator(".marketplace-detail-sheet");
  await expect(mobileSheet).toContainText("Daily Task Helper");
  await expect(mobileSheet).toContainText("Good for");
  await expect(mobileSheet).toContainText("Needs access to");
  await expect(mobileSheet).toContainText("Why this is safe");
  await expect(mobileSheet.getByRole("button", { name: "Add Agent" })).toBeVisible();
  await mobileSheet.getByRole("button", { name: "Add Agent" }).click();
  await page.getByRole("dialog", { name: "Add Daily Task Helper?" }).getByRole("button", { name: "Add Agent" }).click();
  await expect(nav.getByRole("button", { name: "My Agents", exact: true })).toHaveClass(/nav-active/);
  await expect(page.locator(".install-success-panel")).toContainText("Agent Added");
  await expect(page.locator(".install-success-panel").getByRole("button", { name: "Use agent" })).toBeVisible();
  await expect(page.locator(".agent-list")).toBeVisible();
  await expect(page.locator(".detail-panel")).toBeHidden();
  await page.locator(".install-success-panel").getByRole("button", { name: "Use agent" }).click();
  await expect(page.locator(".detail-panel")).toBeVisible();
  await expect(page.locator(".agent-chat-panel")).toContainText("Ask Daily Task Helper");
  await expect(page.locator(".agent-chat-panel")).toContainText("What do you need?");
  await expect(page.locator(".agent-chat-panel")).toContainText("Ready when you are");
  await expect(page.getByPlaceholder("Ask what you want help with…")).toBeVisible();
  await page.getByPlaceholder("Ask what you want help with…").fill("Send an email reminder for me");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".agent-chat-panel")).toContainText("Waiting for you");
  await expect(page.locator(".agent-chat-panel")).toContainText("Nothing continues unless you allow it");
  await expect(page.locator(".chat-approval-banner").getByRole("button", { name: "Allow once" })).toBeVisible();
  await page.locator(".chat-approval-banner").getByRole("button", { name: "Deny" }).click();
  await expect(page.locator(".agent-chat-panel")).toContainText("Denied. Nothing will continue.");
  await nav.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.locator(".audit-panel")).toBeVisible();
  await expect(page.locator(".audit-panel")).toContainText("Activity");
  await expect(page.locator(".audit-panel")).toContainText("Waiting");
  await expect(page.locator(".audit-panel")).toContainText(/waited for you|is waiting for you|Nothing continued/);
  await expect(page.locator(".audit-panel")).toContainText(/Denied\. Nothing continued\.|Nothing continues unless you allow it\./);
  await expect(page.locator(".audit-panel")).not.toContainText("pending_human_approval");
  await expect(page.locator(".audit-panel")).not.toContainText("blocked_by_policy");
  await nav.getByRole("button", { name: "My Agents", exact: true }).click();
  await expect(page.locator(".agent-list")).toBeVisible();
  await expect(page.locator(".detail-panel")).toBeHidden();
  await page.locator(".mobile-agent-card").filter({ hasText: "Daily Task Helper" }).getByRole("button", { name: "Chat" }).click();
  await expect(page.locator(".detail-panel")).toBeVisible();
  await expect(page.locator(".agent-list")).toBeHidden();
  await page.getByRole("button", { name: "Back to My Agents" }).click();
  await expect(page.locator(".agent-list")).toBeVisible();
  await expect(page.locator(".detail-panel")).toBeHidden();
});
