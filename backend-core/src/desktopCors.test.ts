import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "./app.js";

test("API permits the packaged Tauri desktop origin", async () => {
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health`, {
      headers: { origin: "http://tauri.localhost" }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://tauri.localhost");
  } finally {
    server.close();
  }
});
