import { spawnSync } from "node:child_process";

const urlValue = process.env.RESTORE_DRILL_DATABASE_URL;
const backup = process.env.BACKUP_FILE;
if (!urlValue || !backup) throw new Error("RESTORE_DRILL_DATABASE_URL and BACKUP_FILE are required.");
const target = new URL(urlValue);
const databaseName = target.pathname.slice(1);
if (!/_restore_drill(?:_|$)/i.test(databaseName)) throw new Error("Refusing restore: target database name must contain '_restore_drill'.");
if (process.env.CONFIRM_RESTORE_DRILL !== databaseName) throw new Error("CONFIRM_RESTORE_DRILL must exactly match the target database name.");
const isCustom = /\.(dump|backup)$/i.test(backup);
const restore = spawnSync(isCustom ? "pg_restore" : "psql", isCustom ? ["--clean", "--if-exists", "--no-owner", "--dbname", urlValue, backup] : [urlValue, "--file", backup], { stdio: "inherit", shell: false });
if (restore.error) throw restore.error;
if (restore.status !== 0) process.exit(restore.status ?? 1);
const verify = spawnSync("psql", [urlValue, "--tuples-only", "--command", "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"], { encoding: "utf8", shell: false });
if (verify.status !== 0) throw new Error(verify.stderr || "Restored database verification failed.");
const tableCount = Number(verify.stdout.trim());
if (!Number.isInteger(tableCount) || tableCount < 1) throw new Error("Restored database has no public tables.");
console.log(JSON.stringify({ ok: true, completedAt: new Date().toISOString(), targetDatabase: databaseName, tableCount }, null, 2));
