import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { resolvedVaultPath } from "../config/env.js";
import type { VaultParseResult } from "../types/api.js";
import { sha256 } from "./cryptoService.js";

const markdownExtension = /\.mdx?$/i;

export function assertPathInsideVault(candidatePath: string) {
  const resolved = path.resolve(candidatePath);
  const vaultRoot = path.resolve(resolvedVaultPath);
  if (!resolved.startsWith(vaultRoot)) {
    throw new Error("Blocked path traversal attempt outside configured vault.");
  }
  return resolved;
}

export function resolveVaultFile(relativePath: string) {
  return assertPathInsideVault(path.join(resolvedVaultPath, relativePath));
}

export async function parseVaultFile(filePath: string): Promise<VaultParseResult | null> {
  if (!markdownExtension.test(filePath)) return null;
  const safePath = assertPathInsideVault(filePath);
  const raw = await fs.readFile(safePath, "utf8");
  const parsed = matter(raw);
  const relativePath = path.relative(resolvedVaultPath, safePath).replaceAll("\\", "/");
  const frontmatter = parsed.data as Record<string, unknown>;
  const title = String(frontmatter.title ?? path.basename(safePath).replace(markdownExtension, ""));
  const excerpt = parsed.content.replace(/\s+/g, " ").trim().slice(0, 280);
  return {
    title,
    relativePath,
    contentHash: sha256(raw),
    frontmatter,
    body: parsed.content,
    excerpt,
    schemaName: typeof frontmatter.schema === "string" ? frontmatter.schema : undefined
  };
}

export async function listVaultMarkdownFiles(root = resolvedVaultPath): Promise<string[]> {
  const safeRoot = assertPathInsideVault(root);
  const entries = await fs.readdir(safeRoot, { withFileTypes: true });
  const files: string[][] = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(safeRoot, entry.name);
      if (entry.isDirectory()) return listVaultMarkdownFiles(fullPath);
      return markdownExtension.test(entry.name) ? [fullPath] : [];
    })
  );
  return files.flat();
}
