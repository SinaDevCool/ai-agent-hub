import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(scriptDirectory, "..");
const repoDirectory = resolve(backendDirectory, "..");
const environment = process.env.APP_ENV ?? process.env.NODE_ENV ?? "local";

if (environment === "production") {
  console.error("Phase 5 drills refuse to run in production.");
  process.exit(2);
}

const executable = process.execPath;
const startedAt = new Date();
const command = [join(repoDirectory, "node_modules", "tsx", "dist", "cli.mjs"), "--test", "--test-concurrency=1", "src/durableJobService.test.ts", "src/operationalSummaryService.test.ts"];
const result = spawnSync(executable, command, { cwd: backendDirectory, encoding: "utf8", env: process.env });
const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}`.trim();
const passed = result.status === 0;
const completedAt = new Date();
const stamp = completedAt.toISOString().replace(/[:.]/g, "-");
const evidenceDirectory = join(repoDirectory, "release-evidence", "phase-5");
mkdirSync(evidenceDirectory, { recursive: true });

const automatedChecks = [
  "payload redaction and logical deduplication",
  "concurrent worker claim exclusion",
  "expired-lease recovery after process interruption",
  "retry scheduling, exhaustion, and dead-letter transition",
  "uncertain outcomes routed to reconciliation",
  "operator-safe dead-letter retry validation",
  "disabled worker feature guard",
  "activation checklist and operational alert thresholds"
];
const stagingChecks = [
  "apply migration 0020_durable_jobs to the staging database",
  "start a separately deployed staging worker with DURABLE_JOBS_ENABLED=true",
  "repeat database disconnect/reconnect, deployment interruption, provider rate-limit/timeout, and stale-event drills",
  "verify alert delivery and record the named on-call operator",
  "verify end-to-end correlation across jobs, transactions, attempts, receipts, webhooks, and activity logs"
];
const report = { schemaVersion: 1, environment, startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), passed, command: `${executable} ${command.join(" ")}`, automatedChecks, stagingChecks, output };
const jsonPath = join(evidenceDirectory, `${stamp}.json`);
const markdownPath = join(evidenceDirectory, `${stamp}.md`);
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(markdownPath, `# Phase 5 drill evidence\n\n- Environment: **${environment}**\n- Started: ${report.startedAt}\n- Completed: ${report.completedAt}\n- Automated result: **${passed ? "PASS" : "FAIL"}**\n\n## Automated checks\n\n${automatedChecks.map((item) => `- ${item}`).join("\n")}\n\n## Required staging acceptance\n\n${stagingChecks.map((item) => `- [ ] ${item}`).join("\n")}\n\n## Test output\n\n\`\`\`text\n${output}\n\`\`\`\n`, "utf8");

console.log(output);
console.log(`\nEvidence written to ${markdownPath}`);
process.exit(result.status ?? 1);
