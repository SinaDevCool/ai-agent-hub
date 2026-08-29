import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { createApp } from "./app.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestId } from "./middleware/requestId.js";
import { requireUser } from "./middleware/requireUser.js";
import { createRateLimitForTest, resetRateLimitsForTest } from "./middleware/rateLimit.js";

let server: Server;
let baseUrl = "";

before(async () => {
  server = createApp().listen(0);
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("health endpoints stay public and readiness checks database access", async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  const ready = await fetch(`${baseUrl}/health/ready`);
  assert.equal(ready.status, 200);
  const payload = await ready.json() as { ok: boolean; database: string; environment: string; releaseSha: string; migrationVersion: string };
  assert.equal(payload.ok, true);
  assert.equal(payload.database, "ready");
  assert.equal(payload.environment, "local");
  assert.ok(payload.releaseSha);
  assert.equal(payload.migrationVersion, "0018_enable_rls");
});

test("connector callback failures return users to frontend settings", async () => {
  const incomplete = await fetch(`${baseUrl}/api/connectors/google/callback`, { redirect: "manual" });
  assert.equal(incomplete.status, 302);
  const incompleteLocation = new URL(incomplete.headers.get("location")!);
  assert.equal(incompleteLocation.pathname, "/settings");
  assert.equal(incompleteLocation.searchParams.get("connector"), "error");

  const invalidState = await fetch(`${baseUrl}/api/connectors/microsoft/callback?code=test-code&state=invalid-state`, { redirect: "manual" });
  assert.equal(invalidState.status, 302);
  const invalidStateLocation = new URL(invalidState.headers.get("location")!);
  assert.equal(invalidStateLocation.pathname, "/settings");
  assert.equal(invalidStateLocation.searchParams.get("connector"), "error");
  assert.match(invalidStateLocation.searchParams.get("message") ?? "", /try again/i);
});

test("connector start returns provider readiness as a normal response", async () => {
  const userId = `connector-readiness-${Date.now()}`;
  const response = await fetch(`${baseUrl}/api/connectors/google/start`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": userId, "x-user-email": `${userId}@example.test` },
    body: "{}"
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { status?: string; message?: string };
  assert.ok(["ready", "not_configured"].includes(body.status ?? ""));
  assert.ok(body.message);
});

test("request id middleware preserves valid incoming ids and errors echo them", async () => {
  const requestIdValue = "test-request-12345";
  const response = await fetch(`${baseUrl}/api/marketplace/agents?category=NotARealCategory`, {
    headers: { "x-request-id": requestIdValue, "x-user-id": "hardening-user" }
  });

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("x-request-id"), requestIdValue);
  const payload = await response.json() as { error: { code: string; requestId: string } };
  assert.equal(payload.error.code, "validation_error");
  assert.equal(payload.error.requestId, requestIdValue);
});

test("responses include generated request ids when no incoming id is provided", async () => {
  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 200);
  const generatedRequestId = response.headers.get("x-request-id");
  assert.ok(generatedRequestId);
});

test("authenticated API routes return stable auth errors with request ids", async () => {
  const authApp = express();
  authApp.use(requestId);
  authApp.use(requireUser);
  authApp.get("/protected", (_req, res) => res.json({ ok: true }));
  authApp.use(errorHandler);
  const authServer = authApp.listen(0);
  const address = authServer.address() as AddressInfo;
  const authBaseUrl = `http://127.0.0.1:${address.port}`;
  const requestIdValue = "auth-required-12345";

  try {
    const response = await fetch(`${authBaseUrl}/protected`, {
      headers: { "x-request-id": requestIdValue }
    });

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("x-request-id"), requestIdValue);
    const payload = await response.json() as { error: { message: string; code: string; requestId: string } };
    assert.equal(payload.error.message, "Authentication required");
    assert.equal(payload.error.code, "auth_required");
    assert.equal(payload.error.requestId, requestIdValue);
  } finally {
    await new Promise<void>((resolve, reject) => {
      authServer.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("rate limiter returns a stable rate limited error shape", async () => {
  resetRateLimitsForTest();
  const app = express();
  app.use(requestId);
  app.use(createRateLimitForTest({ bucket: "test", windowMs: 60_000, max: 1 }));
  app.get("/limited", (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const limitedServer = app.listen(0);
  const address = limitedServer.address() as AddressInfo;
  const limitedBaseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const first = await fetch(`${limitedBaseUrl}/limited`, { headers: { "x-request-id": "rate-limit-1" } });
    assert.equal(first.status, 200);
    const second = await fetch(`${limitedBaseUrl}/limited`, { headers: { "x-request-id": "rate-limit-2" } });
    assert.equal(second.status, 429);
    assert.equal(second.headers.get("retry-after"), "60");
    const payload = await second.json() as { error: { message: string; code: string; requestId: string } };
    assert.equal(payload.error.message, "Too many requests. Try again soon.");
    assert.equal(payload.error.code, "rate_limited");
    assert.equal(payload.error.requestId, "rate-limit-2");
  } finally {
    await new Promise<void>((resolve, reject) => {
      limitedServer.close((error) => error ? reject(error) : resolve());
    });
    resetRateLimitsForTest();
  }
});
