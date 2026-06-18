import { Pool } from "pg";
import { env } from "@/lib/env";

// Один пул на процесс (переживает hot-reload в dev).
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}
