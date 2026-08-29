const required = ["BACKEND_BASE_URL", "FRONTEND_BASE_URL"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required release verification variables: ${missing.join(", ")}`);
  process.exit(2);
}

const backend = process.env.BACKEND_BASE_URL.replace(/\/+$/, "");
const frontend = process.env.FRONTEND_BASE_URL.replace(/\/+$/, "");

async function expectResponse(name, url, validate) {
  const started = Date.now();
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  validate(response, body);
  return { name, status: response.status, durationMs: Date.now() - started, url: response.url };
}

const checks = [];
checks.push(await expectResponse("backend_liveness", `${backend}/health`, (response, body) => {
  if (!response.ok || body?.ok !== true) throw new Error("Backend liveness check failed.");
}));
checks.push(await expectResponse("backend_readiness", `${backend}/health/ready`, (response, body) => {
  if (!response.ok || body?.database !== "ready") throw new Error("Backend database is not ready.");
}));
checks.push(await expectResponse("frontend_shell", `${frontend}/`, (response, body) => {
  if (!response.ok || typeof body !== "string" || !body.includes('<div id="root">')) {
    throw new Error("Frontend shell check failed.");
  }
}));
checks.push(await expectResponse("frontend_spa_rewrite", `${frontend}/settings`, (response, body) => {
  if (!response.ok || typeof body !== "string" || !body.includes('<div id="root">')) {
    throw new Error("Frontend SPA rewrite check failed.");
  }
}));

console.log(JSON.stringify({ ok: true, verifiedAt: new Date().toISOString(), checks }, null, 2));
