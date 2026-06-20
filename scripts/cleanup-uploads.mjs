import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

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
const uploadsDir = path.resolve(process.cwd(), "uploads");
const cutoff = new Date(Date.now() - ttlDays * MS_PER_DAY);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let checked = 0;
let deleted = 0;

try {
  const { rows } = await pool.query(
    `SELECT id, stored_path
     FROM order_files
     WHERE order_id IS NULL AND created_at < $1`,
    [cutoff]
  );

  for (const row of rows) {
    checked += 1;

    const filePath = path.resolve(process.cwd(), row.stored_path);
    if (!isInsideDir(filePath, uploadsDir)) {
      console.error(`cleanup-uploads: skipped unsafe path ${row.stored_path}`);
      continue;
    }

    await fs.unlink(filePath).catch((error) => {
      if (error?.code !== "ENOENT") {
        console.error(`cleanup-uploads: failed to delete ${row.id}:`, error);
      }
    });
    await pool.query(`DELETE FROM order_files WHERE id = $1`, [row.id]);
    await fs.rmdir(path.dirname(filePath)).catch(() => {});
    deleted += 1;
  }
} finally {
  await pool.end();
}

console.log(`cleanup-uploads: checked=${checked} deleted=${deleted}`);
