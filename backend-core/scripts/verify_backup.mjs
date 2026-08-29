import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const filename = process.env.BACKUP_FILE;
if (!filename) throw new Error("BACKUP_FILE is required.");
const resolved = path.resolve(process.env.INIT_CWD ?? process.cwd(), filename);
const info = await stat(resolved);
if (!info.isFile() || info.size < 1024) throw new Error("Backup must be a non-empty file of at least 1 KiB.");
const contents = await readFile(resolved);
const checksum = createHash("sha256").update(contents).digest("hex");
if (process.env.BACKUP_SHA256 && checksum.toLowerCase() !== process.env.BACKUP_SHA256.toLowerCase()) {
  throw new Error("Backup SHA-256 does not match BACKUP_SHA256.");
}
console.log(JSON.stringify({ ok: true, verifiedAt: new Date().toISOString(), filename: path.basename(resolved), bytes: info.size, sha256: checksum }, null, 2));
