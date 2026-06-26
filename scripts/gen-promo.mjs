import { randomBytes } from "node:crypto";
import { Pool } from "pg";

// Генерация одноразовых промокодов. Печатает коды в stdout, пишет в promo_codes.
// Запуск: node scripts/gen-promo.mjs [count] [prefix]
//   node scripts/gen-promo.mjs 10 TEST   → 10 кодов вида TEST-XXXXXX

const count = Math.max(1, Number(process.argv[2] ?? 5) || 5);
const prefix = (process.argv[3] ?? "TEST").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

function makeCode() {
  // 6 символов base32-подобных, без похожих 0/O/1/I.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = randomBytes(6);
  let s = "";
  for (const b of buf) s += alphabet[b % alphabet.length];
  return `${prefix}-${s}`;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

try {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = makeCode();
    await pool.query(
      `INSERT INTO promo_codes (code) VALUES ($1) ON CONFLICT (code) DO NOTHING`,
      [code]
    );
    codes.push(code);
  }
  console.log(codes.join("\n"));
} finally {
  await pool.end();
}
