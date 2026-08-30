import { expect, test, type Page } from "playwright/test";

const publicRoutes = ["/", "/agents", "/how-it-works", "/privacy", "/security", "/download"];
const workspaceRoutes = [
  "/app",
  "/app/discover",
  "/app/agents",
  "/app/approvals",
  "/app/activity",
  "/app/private-data",
  "/app/settings",
  "/app/creator",
  "/app/operator/review",
  "/app/operator/operations",
  "/app/operator/beta"
];

async function expectSoundLayout(page: Page, route: string) {
  await expect(page.locator("main")).toBeVisible();
  const issues = await page.evaluate(() => {
    const root = document.documentElement;
    const findings: string[] = [];
    if (root.scrollWidth > root.clientWidth + 1) {
      findings.push(`document overflow: ${root.scrollWidth}px > ${root.clientWidth}px`);
    }

    for (const element of document.querySelectorAll<HTMLElement>("main *, footer *")) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) continue;
      if (element.classList.contains("sr-only")) continue;
      const ownText = Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (ownText && Number.parseFloat(style.fontSize) < 12) {
        findings.push(`tiny text (${style.fontSize}): ${element.className || element.tagName}`);
      }
      if (rect.right > root.clientWidth + 1 || rect.left < -1) {
        findings.push(`offscreen: ${element.className || element.tagName}`);
      }
    }
    return [...new Set(findings)].slice(0, 20);
  });
  expect(issues, `${route} layout findings`).toEqual([]);
}

for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`${viewport.name} routes have no overflow or unreadably small text`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await page.addInitScript(() => window.localStorage.setItem("ai-agent-hub-user-id", `layout-${Date.now()}`));
    for (const theme of ["dark", "light"] as const) {
      await page.addInitScript((selectedTheme) => window.localStorage.setItem("ai-agent-hub-theme", selectedTheme), theme);
      for (const route of [...publicRoutes, ...workspaceRoutes]) {
        await page.goto(route);
        await expectSoundLayout(page, `${viewport.name}:${theme}:${route}`);
      }
    }
  });
}
