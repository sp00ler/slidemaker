import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_TTL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseTtlDays(value) {
  if (value === undefined || value === "") return DEFAULT_TTL_DAYS;

  const ttl = Number(value);
  if (!Number.isFinite(ttl) || ttl < 0) {
    throw new Error(`Invalid TTL days: ${value}`);
  }

  return ttl;
}

function isInsideDir(filePath, dirPath) {
  const relative = path.relative(dirPath, filePath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

const ttlDays = parseTtlDays(process.argv[2] ?? process.env.DOWNLOADS_TTL_DAYS);
const downloadsDir = path.resolve(process.cwd(), "public", "downloads");
const cutoffMs = Date.now() - ttlDays * MS_PER_DAY;

let checked = 0;
let deleted = 0;

let entries;
try {
  entries = await fs.readdir(downloadsDir, { withFileTypes: true });
} catch (error) {
  if (error?.code === "ENOENT") {
    console.log(`cleanup-downloads: checked=${checked} deleted=${deleted}`);
    process.exit(0);
  }
  throw error;
}

for (const entry of entries) {
  if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".pptx")) {
    continue;
  }

  checked += 1;

  const filePath = path.resolve(downloadsDir, entry.name);
  if (!isInsideDir(filePath, downloadsDir)) {
    console.error(`cleanup-downloads: skipped unsafe path ${entry.name}`);
    continue;
  }

  try {
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || stat.mtimeMs >= cutoffMs) {
      continue;
    }

    await fs.unlink(filePath);
    deleted += 1;
  } catch (error) {
    console.error(`cleanup-downloads: failed to delete ${entry.name}:`, error);
  }
}

console.log(`cleanup-downloads: checked=${checked} deleted=${deleted}`);
