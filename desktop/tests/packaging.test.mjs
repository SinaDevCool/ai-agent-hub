import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop build uses relative assets and its explicit desktop environment", async () => {
  const tauri = JSON.parse(await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
  const vite = await readFile(new URL("../../frontend/vite.config.ts", import.meta.url), "utf8");
  const environment = await readFile(new URL("../../frontend/.env.desktop", import.meta.url), "utf8");
  assert.match(tauri.build.beforeBuildCommand, /--mode desktop/);
  assert.match(vite, /base:\s*["']\.\/["']/);
  assert.match(environment, /VITE_API_BASE_URL=https:\/\/ai-agent-hub-api-staging\.onrender\.com/);
  assert.match(environment, /VITE_APP_ENV=staging/);
  assert.match(environment, /VITE_DESKTOP_AUTH_REDIRECT_URL=ai-agent-hub:\/\/auth\/callback/);
  assert.match(environment, /VITE_DESKTOP_AUTH_RECOVERY_URL=https:\/\/ai-agent-hub-staging\.pages\.dev\/desktop-auth/);
  assert.doesNotMatch(environment, /localhost:4141/);
  assert.match(tauri.app.security.csp, /http:\/\/localhost:\*/);
  assert.match(tauri.app.security.csp, /ws:\/\/localhost:\*/);
});

test("desktop model and sidecar manifests pin checksums and sizes", async () => {
  const models = JSON.parse(await readFile(new URL("../model-manifest.json", import.meta.url), "utf8"));
  const sidecar = JSON.parse(await readFile(new URL("../sidecar-manifest.json", import.meta.url), "utf8"));
  assert.ok(models.models.length >= 2);
  for (const model of models.models) {
    assert.match(model.sha256, /^[a-f0-9]{64}$/);
    assert.ok(model.sizeBytes > 0);
    assert.match(model.downloadUrl, /^https:\/\//);
  }
  assert.match(sidecar.platforms["windows-x64"].sha256, /^[a-f0-9]{64}$/);
  assert.ok(sidecar.platforms["windows-x64"].sizeBytes > 0);
});
