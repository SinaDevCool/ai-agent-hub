import chokidar, { type FSWatcher } from "chokidar";
import { logger } from "../config/logger.js";
import { resolvedVaultPath } from "../config/env.js";
import { indexVaultFile } from "./vaultIndexService.js";

let watcher: FSWatcher | undefined;

export function startVaultWatcher(userId: string) {
  if (watcher) return watcher;
  watcher = chokidar.watch("**/*.md", {
    cwd: resolvedVaultPath,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
  });

  watcher.on("add", (file) => indexChangedFile(file, userId));
  watcher.on("change", (file) => indexChangedFile(file, userId));
  watcher.on("error", (error) => logger.error({ error }, "Vault watcher error"));
  logger.info({ vaultPath: resolvedVaultPath }, "Vault watcher started");
  return watcher;
}

async function indexChangedFile(relativePath: string, userId: string) {
  try {
    await indexVaultFile(`${resolvedVaultPath}/${relativePath}`, userId);
  } catch (error) {
    logger.error({ error, relativePath }, "Failed to index changed vault file");
  }
}

export async function stopVaultWatcher() {
  await watcher?.close();
  watcher = undefined;
}
