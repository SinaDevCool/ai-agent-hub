import { expect, test } from "playwright/test";

test("desktop Local AI lifecycle and external OAuth controls remain operable", async ({ page }) => {
  await page.addInitScript(() => {
    const modelDirectory = "C:\\Users\\Test\\AppData\\Local\\com.aiagenthub.desktop\\models";
    let languageInstalled = false;
    let retrievalInstalled = false;
    const status = () => ({
      available: languageInstalled,
      runtime: "tauri",
      state: languageInstalled ? "ready" : "model_missing",
      modelId: languageInstalled ? "ministral-3-3b-q4" : undefined,
      modelLabel: languageInstalled ? "Ministral 3 3B" : undefined,
      installedBytes: languageInstalled ? 2147023008 : undefined,
      embeddingModelId: retrievalInstalled ? "nomic-embed-v2-moe-q4" : undefined,
      embeddingModelLabel: retrievalInstalled ? "Nomic Embed Text v2 MoE" : undefined,
      embeddingInstalledBytes: retrievalInstalled ? 344120288 : undefined,
      recommendedModelId: "ministral-3-3b-q4",
      modelDirectory,
      message: languageInstalled ? "Local interpretation is ready." : "Choose a checksummed model."
    });
    Object.assign(window, {
      __desktopTest: { openedUrl: "", folderOpened: false },
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args?: Record<string, unknown>) => {
          if (command === "local_ai_status") return status();
          if (command === "local_ai_download_progress") return { modelId: "ministral-3-3b-q4", receivedBytes: 50, totalBytes: 100, active: true };
          if (command === "install_local_model") {
            if (args?.modelId === "nomic-embed-v2-moe-q4") retrievalInstalled = true;
            else languageInstalled = true;
            return status();
          }
          if (command === "remove_local_model") {
            if (args?.modelId === "nomic-embed-v2-moe-q4") retrievalInstalled = false;
            else languageInstalled = false;
            return status();
          }
          if (command === "test_local_model") return { ok: true, latencyMs: 1200, message: "Local model returned a valid interpretation." };
          if (command === "open_local_model_folder") { (window as typeof window & { __desktopTest: { folderOpened: boolean } }).__desktopTest.folderOpened = true; return; }
          if (command === "open_external_url") { (window as typeof window & { __desktopTest: { openedUrl: string } }).__desktopTest.openedUrl = String(args?.url ?? ""); return; }
          throw new Error(`Unexpected desktop command: ${command}`);
        }
      }
    });
  });

  await page.route("**/api/connectors", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { accounts: [] } });
    return route.continue();
  });
  await page.route("**/api/connectors/google/start", (route) => route.fulfill({
    json: { status: "ready", provider: "google", authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=test", scopes: [], message: "Open Google." }
  }));
  await page.route("**/api/connectors/microsoft/start", (route) => route.fulfill({
    json: { status: "ready", provider: "microsoft", authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=test", scopes: [], message: "Open Microsoft." }
  }));

  await page.goto("/settings");
  await page.getByRole("button", { name: "Download recommended model" }).click();
  await expect(page.getByText("Ministral 3 3B", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Test model" }).click();
  await expect(page.getByText("Local model returned a valid interpretation.")).toBeVisible();
  await page.getByRole("button", { name: "Install multilingual retrieval" }).click();
  await expect(page.getByText("Nomic Embed Text v2 MoE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove retrieval model" }).click();
  await expect(page.getByText("Retrieval model removed from this device.")).toBeVisible();
  await page.getByRole("button", { name: "Open model folder" }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __desktopTest: { folderOpened: boolean } }).__desktopTest.folderOpened)).toBe(true);

  await page.getByRole("button", { name: "Connect Google" }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __desktopTest: { openedUrl: string } }).__desktopTest.openedUrl)).toContain("accounts.google.com");
  await page.getByRole("button", { name: "Check connection" }).click();
  await page.getByRole("button", { name: "Connect Microsoft" }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __desktopTest: { openedUrl: string } }).__desktopTest.openedUrl)).toContain("login.microsoftonline.com");
});
