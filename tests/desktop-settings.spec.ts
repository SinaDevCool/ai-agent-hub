import { expect, test } from "playwright/test";

test("desktop Local AI lifecycle and external OAuth controls remain operable", async ({ page }) => {
  await page.addInitScript(() => {
    const modelDirectory = "C:\\Users\\Test\\AppData\\Local\\com.aiagenthub.desktop\\models";
    const installedLanguages = new Set<string>();
    let activeLanguage = "";
    let retrievalInstalled = false;
    const status = () => ({
      available: Boolean(activeLanguage),
      runtime: "tauri",
      state: activeLanguage ? "ready" : "model_missing",
      modelId: activeLanguage || undefined,
      modelLabel: activeLanguage === "ministral-3-8b-q4" ? "Ministral 3 8B" : activeLanguage ? "Ministral 3 3B" : undefined,
      installedBytes: activeLanguage === "ministral-3-8b-q4" ? 5198911904 : activeLanguage ? 2147023008 : undefined,
      embeddingModelId: retrievalInstalled ? "nomic-embed-v2-moe-q4" : undefined,
      embeddingModelLabel: retrievalInstalled ? "Nomic Embed Text v2 MoE" : undefined,
      embeddingInstalledBytes: retrievalInstalled ? 344120288 : undefined,
      recommendedModelId: "ministral-3-3b-q4",
      availableModels: [
        { id: "ministral-3-3b-q4", label: "Ministral 3 3B", role: "default", sizeBytes: 2147023008, minimumMemoryBytes: 6442450944, installed: installedLanguages.has("ministral-3-3b-q4") },
        { id: "ministral-3-8b-q4", label: "Ministral 3 8B", role: "quality", sizeBytes: 5198911904, minimumMemoryBytes: 12884901888, installed: installedLanguages.has("ministral-3-8b-q4") },
        { id: "nomic-embed-v2-moe-q4", label: "Nomic Embed Text v2 MoE", role: "embedding", sizeBytes: 344120288, minimumMemoryBytes: 1073741824, installed: retrievalInstalled }
      ],
      modelDirectory,
      message: activeLanguage ? "Local interpretation is ready." : "Choose a checksummed model."
    });
    Object.assign(window, {
      __desktopTest: { openedUrl: "", folderOpened: false },
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args?: Record<string, unknown>) => {
          if (command === "local_ai_status") return status();
          if (command === "local_ai_download_progress") return { modelId: "ministral-3-3b-q4", receivedBytes: 50, totalBytes: 100, active: true };
          if (command === "install_local_model") {
            if (args?.modelId === "nomic-embed-v2-moe-q4") retrievalInstalled = true;
            else { installedLanguages.add(String(args?.modelId)); activeLanguage = String(args?.modelId); }
            return status();
          }
          if (command === "select_local_model") { activeLanguage = String(args?.modelId); return status(); }
          if (command === "remove_local_model") {
            if (args?.modelId === "nomic-embed-v2-moe-q4") retrievalInstalled = false;
            else { installedLanguages.delete(String(args?.modelId)); if (activeLanguage === args?.modelId) activeLanguage = ""; }
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
  for (const provider of ["google", "microsoft"] as const) {
    await page.route(`**/api/connectors/${provider}/start`, (route) => {
      expect(route.request().postDataJSON()).toEqual({ returnPath: "/connections/complete" });
      return route.fulfill({
        json: {
          status: "ready",
          provider,
          authorizationUrl: provider === "google"
            ? "https://accounts.google.com/o/oauth2/v2/auth?client_id=test"
            : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=test",
          scopes: [],
          message: `Open ${provider}.`
        }
      });
    });
  }

  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Local AI", exact: true }).click();
  const fastModel = page.locator(".local-model-option").filter({ hasText: "Ministral 3 3B" });
  const qualityModel = page.locator(".local-model-option").filter({ hasText: "Ministral 3 8B" });
  await fastModel.getByRole("button", { name: "Download" }).click();
  await expect(fastModel.getByText("Active")).toBeVisible();
  await page.getByRole("button", { name: "Test model" }).click();
  await expect(page.getByText("Local model returned a valid interpretation.")).toBeVisible();
  await qualityModel.getByRole("button", { name: "Download" }).click();
  await expect(qualityModel.getByText("Active")).toBeVisible();
  await fastModel.getByRole("button", { name: "Use model" }).click();
  await expect(page.getByText("Active language model changed.")).toBeVisible();
  await page.getByRole("button", { name: "Install multilingual retrieval" }).click();
  await expect(page.getByText("Nomic Embed Text v2 MoE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove retrieval model" }).click();
  await expect(page.getByText("Retrieval model removed from this device.")).toBeVisible();
  await page.getByRole("button", { name: "Open model folder" }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __desktopTest: { folderOpened: boolean } }).__desktopTest.folderOpened)).toBe(true);

  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByRole("button", { name: "Connect Google" }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __desktopTest: { openedUrl: string } }).__desktopTest.openedUrl)).toContain("accounts.google.com");
  await page.getByRole("button", { name: "Check connection" }).click();
  await page.getByRole("button", { name: "Connect Microsoft" }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __desktopTest: { openedUrl: string } }).__desktopTest.openedUrl)).toContain("login.microsoftonline.com");
});
