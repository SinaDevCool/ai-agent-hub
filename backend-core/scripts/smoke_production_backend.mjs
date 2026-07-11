const baseUrl = (process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:4141").replace(/\/+$/, "");

async function readJson(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  return response.json().catch(() => null);
}

async function check(path, options, assertion) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await readJson(response);
  assertion(response, body);
  return { status: response.status, requestId: response.headers.get("x-request-id") };
}

const results = [];

results.push(await check("/health", undefined, (response, body) => {
  if (response.status !== 200 || !body?.ok) {
    throw new Error(`/health failed with ${response.status}`);
  }
}));

results.push(await check("/health/ready", undefined, (response, body) => {
  if (response.status !== 200 || body?.database !== "ready") {
    throw new Error(`/health/ready failed with ${response.status}`);
  }
}));

results.push(await check("/api/agents", {
  headers: {
    "x-user-id": "smoke-spoofed-user",
    "x-request-id": "production-smoke-auth"
  }
}, (response, body) => {
  if (response.status !== 401 || body?.error?.code !== "auth_required") {
    throw new Error(`/api/agents should reject unauthenticated requests, got ${response.status}`);
  }
  if (body.error.requestId !== "production-smoke-auth") {
    throw new Error("/api/agents did not echo the production smoke request id");
  }
}));

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  checks: [
    { name: "liveness", ...results[0] },
    { name: "readiness", ...results[1] },
    { name: "auth_guard", ...results[2] }
  ]
}, null, 2));
