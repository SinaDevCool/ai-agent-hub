import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function migrationSqlFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return migrationSqlFiles(target);
    return entry.isFile() && entry.name === "migration.sql" ? [target] : [];
  }));
  return files.flat();
}

test("PostgreSQL migrations do not contain a UTF-8 BOM", async () => {
  const root = path.resolve(process.cwd(), "prisma/postgres/migrations");
  const files = await migrationSqlFiles(root);

  assert.ok(files.length > 0, "Expected PostgreSQL migration files");
  for (const file of files) {
    const contents = await readFile(file);
    assert.notDeepEqual(
      [...contents.subarray(0, 3)],
      [0xef, 0xbb, 0xbf],
      `${path.relative(root, file)} starts with a UTF-8 BOM`
    );
  }
});
