import { randomBytes } from "node:crypto";
import { Pool } from "pg";

// Генерация одноразовых промокодов. Печатает коды в stdout, пишет в promo_codes.
// Запуск: node scripts/gen-promo.mjs [count] [prefix] [discountPercent]
//   node scripts/gen-promo.mjs 10 TEST      -> 10 бесплатных кодов TEST-XXXXXX
//   node scripts/gen-promo.mjs 5 SALE 30   -> 5 кодов SALE-XXXXXX со скидкой 30%

const count = Math.max(1, Number(process.argv[2] ?? 5) || 5);
const prefix = (process.argv[3] ?? "TEST").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const discountPercent = Number(process.argv[4] ?? 100);

if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 100) {
  console.error("discountPercent должен быть целым числом от 1 до 100");
  process.exit(1);
}

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
      `INSERT INTO promo_codes (code, discount_percent)
       VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING`,
      [code, discountPercent]
    );
    codes.push(`${code} -${discountPercent}%`);
  }
  console.log(codes.join("\n"));
} finally {
  await pool.end();
}