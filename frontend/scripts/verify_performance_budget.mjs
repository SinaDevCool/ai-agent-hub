import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const assets = path.resolve(process.cwd(), "dist/assets");
const files = await readdir(assets);
const measured = await Promise.all(files.filter((name) => /\.(js|css)$/.test(name)).map(async (name) => {
  const content = await readFile(path.join(assets, name));
  return { name, type: name.endsWith(".js") ? "js" : "css", rawBytes: content.length, gzipBytes: gzipSync(content).length };
}));
const js = measured.filter((item) => item.type === "js");
const css = measured.filter((item) => item.type === "css");
// The desktop authentication bridge and Local AI controls establish the new
// release baseline. Keep only narrow headroom so future growth still fails CI.
const budgets = { totalJsGzip: 211_000, largestJsGzip: 75_000, totalCssGzip: 25_000 };
const totals = { totalJsGzip: js.reduce((sum, item) => sum + item.gzipBytes, 0), largestJsGzip: Math.max(0, ...js.map((item) => item.gzipBytes)), totalCssGzip: css.reduce((sum, item) => sum + item.gzipBytes, 0) };
const failures = Object.entries(budgets).filter(([key, limit]) => totals[key] > limit).map(([key, limit]) => `${key} ${totals[key]} exceeds ${limit}`);
console.log(JSON.stringify({ ok: failures.length === 0, measuredAt: new Date().toISOString(), budgets, totals, assets: measured.sort((a, b) => b.gzipBytes - a.gzipBytes), failures }, null, 2));
if (failures.length) process.exit(1);
