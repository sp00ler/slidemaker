import pg from "pg";

const { Pool } = pg;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await pool.query("DELETE FROM login_tokens WHERE expires_at < now()");
    await pool.query("DELETE FROM sessions WHERE expires_at < now()");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("cleanup-auth failed:", err);
  process.exitCode = 1;
});
