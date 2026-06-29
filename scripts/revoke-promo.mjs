import { Pool } from "pg";

// Аннулирование промокодов: помечает used=true, чтобы код больше не сработал.
// Запись в таблице остаётся (видно когда и что погасили).
// Запуск: node scripts/revoke-promo.mjs <код> [<код> ...]
//   node scripts/revoke-promo.mjs SALE-AB3K9P            → один код
//   node scripts/revoke-promo.mjs SALE-AB3K9P TEST-XY12Z → несколько
//   node scripts/revoke-promo.mjs "SALE-%"               → все SALE-* (по маске)
//   node scripts/revoke-promo.mjs --list                 → показать все коды и статус

const args = process.argv.slice(2);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

if (args.length === 0) {
  console.error("Укажи код(ы) или маску. Пример: node scripts/revoke-promo.mjs SALE-AB3K9P");
  console.error("Список всех кодов:        node scripts/revoke-promo.mjs --list");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

try {
  if (args[0] === "--list") {
    const { rows } = await pool.query(
      `SELECT code, used, used_at FROM promo_codes ORDER BY created_at`
    );
    for (const r of rows) {
      const status = r.used ? `погашен ${r.used_at?.toISOString() ?? ""}` : "ДЕЙСТВУЕТ";
      console.log(`${r.code.padEnd(16)} ${status}`);
    }
    console.log(`\nВсего: ${rows.length}, действующих: ${rows.filter((r) => !r.used).length}`);
  } else {
    for (const arg of args) {
      // Маска (содержит %) → LIKE, иначе точное совпадение.
      const isMask = arg.includes("%");
      const { rows } = await pool.query(
        `UPDATE promo_codes
         SET used = true, used_at = now()
         WHERE code ${isMask ? "LIKE" : "="} $1 AND used = false
         RETURNING code`,
        [arg]
      );
      if (rows.length === 0) {
        console.log(`${arg}: ничего не погашено (не найден или уже использован)`);
      } else {
        for (const r of rows) console.log(`${r.code}: погашен`);
      }
    }
  }
} finally {
  await pool.end();
}
