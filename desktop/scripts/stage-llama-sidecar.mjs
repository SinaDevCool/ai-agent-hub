import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(desktopDir, "sidecar-manifest.json"), "utf8"));
const platformKey = process.platform === "win32" && process.arch === "x64" ? "windows-x64" : "";
const artifact = manifest.platforms[platformKey];
if (!artifact) throw new Error(`No audited llama.cpp sidecar is configured for ${process.platform}-${process.arch}.`);

const cacheDir = path.join(desktopDir, ".sidecar-cache");
const zipPath = path.join(cacheDir, `${manifest.runtime}-${manifest.release}-${platformKey}.zip`);
const extractDir = path.join(cacheDir, "extracted");
const outputDir = path.join(desktopDir, "src-tauri", "binaries");
await mkdir(cacheDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

async function sha256(file) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

let validCache = false;
try {
  validCache = (await stat(zipPath)).size === artifact.sizeBytes && await sha256(zipPath) === artifact.sha256;
} catch {}
if (!validCache) {
  const response = await fetch(artifact.url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Sidecar download failed with HTTP ${response.status}.`);
  await pipeline(response.body, createWriteStream(zipPath));
}
const downloaded = await stat(zipPath);
if (downloaded.size !== artifact.sizeBytes || await sha256(zipPath) !== artifact.sha256) {
  await rm(zipPath, { force: true });
  throw new Error("The llama.cpp sidecar failed its pinned size or SHA-256 verification.");
}

await rm(extractDir, { recursive: true, force: true });
await mkdir(extractDir, { recursive: true });
const command = `Expand-Archive -LiteralPath '${zipPath.replaceAll("'", "''")}' -DestinationPath '${extractDir.replaceAll("'", "''")}' -Force`;
const expanded = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { stdio: "inherit" });
if (expanded.status !== 0) throw new Error("Could not extract the verified llama.cpp sidecar.");

const copy = spawnSync("robocopy.exe", [extractDir, outputDir, "*.exe", "*.dll", "/S", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"], { stdio: "inherit" });
if (copy.status > 7) throw new Error(`Could not stage llama.cpp runtime files (robocopy ${copy.status}).`);
await stat(path.join(outputDir, artifact.entrypoint));
process.stdout.write(`Staged verified ${manifest.runtime} ${manifest.release} for ${platformKey}.\n`);
