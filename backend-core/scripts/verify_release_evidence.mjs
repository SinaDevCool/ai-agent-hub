import { readFile } from "node:fs/promises";
import path from "node:path";

const requiredGates = ["security", "backup_restore", "accessibility", "performance", "privacy_legal", "observability_incident", "release_rollback", "local_ai"];
const filename = process.env.RELEASE_EVIDENCE_FILE;
if (!filename) throw new Error("RELEASE_EVIDENCE_FILE is required.");
const resolved = path.resolve(process.env.INIT_CWD ?? process.cwd(), filename);
const evidence = JSON.parse(await readFile(resolved, "utf8"));
const failures = [];
for (const name of requiredGates) {
  const gate = evidence.gates?.[name];
  if (!gate || gate.status !== "passed") failures.push(`${name}: status must be passed`);
  for (const field of ["owner", "approver", "verifiedAt", "evidenceUrl", "rollbackPath"]) {
    if (!gate?.[field] || typeof gate[field] !== "string") failures.push(`${name}: missing ${field}`);
  }
  if (gate?.verifiedAt && Number.isNaN(Date.parse(gate.verifiedAt))) failures.push(`${name}: verifiedAt is invalid`);
}
if (!evidence.releaseSha || !evidence.environment) failures.push("releaseSha and environment are required");
if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, releaseSha: evidence.releaseSha, environment: evidence.environment, verifiedAt: new Date().toISOString(), gates: requiredGates }, null, 2));
