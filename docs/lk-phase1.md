# Бриф исполнителю: Личный кабинет (Фаза 1) + magic-link авторизация

Документ самодостаточный. Исполнитель (Codex/Sonnet) может работать только по нему.
Роли: архитектор/ревью — главный агент; исполнитель пишет код. **Стоп-поинт исполнителя:**
после реализации прогнать `npm run build`, `npm run typecheck`, `npm test`, показать diff и вывод
команд, **НЕ коммитить** — ревью делает архитектор.

---

## 1. Контекст проекта (факты из кода)

- **Стек:** Next.js 14.2.18 (App Router), React 18, Postgres через `pg` (`lib/db.ts` экспортит `pool`),
  pptxgenjs, nodemailer, Anthropic SDK, YooKassa. **Чистый CSS** в `app/globals.css` (НЕТ Tailwind,
  НЕТ компонентных UI-библиотек). UI на русском.
- **Пакетный менеджер:** npm (на VPS только npm). Деплой ручной, прод-порт 3001 (pm2), не 3000.
- **БД:** одна схема `db/schema.sql` + инкрементальные миграции `db/migrations/NNN_*.sql`.
  Применяются вручную: `psql "$DATABASE_URL" -f db/migrations/NNN_*.sql`. Колонки добавлять через
  `ADD COLUMN IF NOT EXISTS`, индексы `IF NOT EXISTS`. Дублировать изменение и в `schema.sql`.
- **Существующие таблицы:** `orders` (id uuid pk, email, tariff, slide_count, topic, wishes,
  storyboard, style, status: pending|generating|awaiting_manual|done|error, file_path, created_at),
  `order_files` (upload_token, order_id, slide_number, stored_path, mime, size, description, kind:
  'slide'|'source', created_at).
- **Ключевые модули:**
  - `lib/orders.ts` — CRUD заказов (createOrder, getOrder, claimForGeneration, markDone/Error/...,
    bindUploadFilesToOrder, getOrderFiles, getOrderSource).
  - `lib/generate.ts` — `processOrder(order)`: генерит колоду(ы) и шлёт письмо. Уже делает 2 авто-варианта.
  - `lib/anthropic.ts` — `generateDeck(params)`.
  - `lib/mailer.ts` — отправка писем (Beget SMTP, nodemailer). Есть sendDeckEmail, sendAuthorCustomerEmail,
    sendAdminOrderEmail.
  - `lib/env.ts` — валидирует process.env через zod; `APP_URL` (дефолт http://localhost:3000),
    `DOWNLOADS_TTL_DAYS` (дефолт 7).
  - Маршруты: `app/api/checkout/route.ts` (создаёт заказ + платёж YooKassa, привязывает upload_token),
    `app/api/webhook/yukassa/route.ts` (платёж подтверждён → processOrder), `app/api/status/route.ts`
    (GET ?order=<uuid> → {status, filePath}), `app/api/download/[filename]/route.ts`,
    `app/api/upload/route.ts`.
  - `app/page.tsx` — лендинг с формой заказа (client component). `app/success/page.tsx` — поллинг статуса.

### Тестовый харнес (ВАЖНО — соблюдать паттерн)
Тесты в `lib/__tests__/*.test.ts`. Раннер в `package.json` script `test`: `tsc` компилит перечисленные
тест-файлы в `.test-dist`, затем `node --test`. Тесты НЕ ходят в реальную БД: они транспилируют
тестируемый модуль в temp-каталог и подменяют `Module._resolveFilename` для алиаса `@/`, а `lib/db.ts`
стабится инлайн. Если добавляешь новый модуль, который импортит другой `@/lib/*`, нужно либо
транспилировать зависимость в runtime-дерево, либо застабить её (см. как сделано в
`lib/__tests__/uploads.test.ts` и `order-wishes-storyboard.test.ts`). Новые тест-файлы дописывать в обе
строки script `test` (и в `tsc` список, и в `node --test` список).

---

## 2. Что уже сделано в этой сессии (НЕ трогать без нужды)

- **История 1** (`feat: build deck from uploaded .docx source`): загрузка исходной работы .docx,
  извлечение картинок+текста (`lib/docx.ts`, jszip), AI отбирает релевантные картинки. Миграция
  `003_source_doc.sql` (колонка `order_files.kind`).
- **Blast-loader** для загрузки .docx (`app/page.tsx` SourceUploader + `.blast*` в globals.css).
- **SEO/favicon** (`app/icon.svg`, `apple-icon.svg`, `opengraph-image.tsx`, `robots.ts`, `sitemap.ts`,
  metadata+JSON-LD в `layout.tsx`).
- **Центрирование формы** (`.form-section .card{margin-inline:auto}`).

---

## 3. Решения по фиче (зафиксированы)

- **Авторизация: magic-link.** Пароля нет. Вход по одноразовой ссылке на email.
- **Авто-регистрация:** при создании заказа аккаунт создаётся/находится по email (upsert).
- **Когда приходит вход:** в письме с готовой презентацией (после оплаты) — magic-link в ЛК. Первый раз
  с приветствием. Для повторного входа — страница «Войти» (ввод email → новый magic-link на почту).
- **Фазами.** ЭТА фаза = Фаза 1 (аккаунты + вход + ЛК + история + вторая генерация). Админка = Фаза 2 (НЕ
  здесь).

### ⚠️ Вопрос к архитектору/владельцу до финала (флажок, не выдумывать):
«Вторая генерация без лимита по времени» — трактуем как **ОДНА бесплатная повторная генерация на
оплаченный заказ, не ограниченная по времени** (можно воспользоваться позже). НЕ «бесконечные бесплатные
генерации» — это даёт из одной оплаты бесконечно колод (abuse/себестоимость ИИ). Если владелец
действительно хочет безлимит — нужно отдельное подтверждение. Реализуем флаг `regen_used`.

---

## 4. Фаза 1 — спецификация

### 4.1 БД — миграция `db/migrations/004_users.sql` (+ зеркально в schema.sql)
```sql
CREATE TABLE IF NOT EXISTS users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  role       text NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- magic-link токены: одноразовые, c TTL, хранить ХЭШ токена (sha256), не сам токен
CREATE TABLE IF NOT EXISTS login_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_tokens_hash_idx ON login_tokens (token_hash);

-- сессии (cookie хранит только id сессии; httpOnly)
CREATE TABLE IF NOT EXISTS sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS regen_used boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id uuid REFERENCES orders(id); -- повтор ссылается на оригинал
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders (user_id);
```

### 4.2 lib/users.ts (новый)
- `upsertUserByEmail(email): Promise<User>` — найти или создать (роль 'user').
- `getUserById(id)`, `getUserByEmail(email)`.

### 4.3 lib/auth.ts (новый)
- Токены: `crypto.randomBytes(32).toString('base64url')` (сырой — в ссылку), в БД хранить
  `sha256(raw)`. TTL логин-токена 30 мин, одноразовый (выставлять `used_at`).
- `createLoginToken(userId): Promise<rawToken>`.
- `consumeLoginToken(rawToken): Promise<userId | null>` — проверка: найден по хэшу, не истёк, не использован;
  пометить used; вернуть user_id.
- Сессии: `createSession(userId): Promise<sessionId>` (TTL 30 дней), `getSession(sessionId)`,
  `deleteSession(sessionId)`.
- Cookie: httpOnly, Secure, SameSite=Lax, имя `sm_session`, значение = sessionId. Использовать
  `cookies()` из `next/headers`. Хелперы `setSessionCookie`, `clearSessionCookie`,
  `getCurrentUser()` (читает cookie → session → user).
- Новый env: `APP_URL` уже есть (для построения ссылок). Доп. секрет НЕ обязателен (sessionId —
  непредсказуемый uuid в БД). Если хочешь подписывать cookie — добавь `SESSION_SECRET` в `lib/env.ts`
  опционально.

### 4.4 Авто-регистрация при заказе
- `app/api/checkout/route.ts`: после `createOrder` (или внутри) — `upsertUserByEmail(email)` и проставить
  `orders.user_id`. Не ломать существующую валидацию/поток оплаты.

### 4.5 Письмо с входом
- `lib/mailer.ts`: в `sendDeckEmail` добавить magic-link в ЛК (сгенерить через `createLoginToken`).
  Текст: если это первый заказ пользователя — приветствие «вы зарегистрированы, вот вход в кабинет»,
  иначе — «ваши презентации в кабинете». Ссылка вида `${APP_URL}/login/verify?token=<raw>`.

### 4.6 Маршруты входа
- `app/api/auth/request/route.ts` (POST {email}) — upsert user, создать login-token, отправить письмо с
  magic-link. Anti-enumeration: всегда отвечать 200 «если email есть — письмо отправлено». Rate-limit по
  email/IP (простой: не чаще 1/60с — можно через таблицу login_tokens created_at).
- `app/login/verify/route.ts` (GET ?token=) — `consumeLoginToken` → создать сессию → выставить cookie →
  redirect на `/account`.
- `app/api/auth/logout/route.ts` (POST) — удалить сессию, очистить cookie.

### 4.7 Страницы
- `app/login/page.tsx` — форма «введите email» → POST /api/auth/request → «проверьте почту». Стиль —
  как существующая форма (классы из globals.css: `.card`, `.field`, `.btn`).
- `app/account/page.tsx` — ЛК. Server component: `getCurrentUser()`; если нет — redirect на /login.
  Показать список заказов пользователя: название (topic), статус, дата/время создания, ссылка на файл
  если `file_path` есть и не истёк (TTL уже работает через download). Для оплаченных заказов с
  `regen_used=false` — кнопка «Сгенерировать ещё раз».
  Хранение истории: ссылка живёт TTL (как сейчас downloads sweep удаляет .pptx). После истечения файла —
  показывать только название+дата (ссылку не показывать / «срок истёк»). Можно определять истечение по
  отсутствию файла или по `created_at + DOWNLOADS_TTL_DAYS`.

### 4.8 Вторая генерация (одна на заказ)
- `app/api/regenerate/route.ts` (POST) — авторизация по сессии (`getCurrentUser`). Тело: `orderId` +
  поля формы (topic/style/slideCount/wishes — можно менять; «сбрасывается форма», новая тема допустима).
  Проверки: заказ принадлежит пользователю, `status='done'`, `regen_used=false`. Действие: создать НОВЫЙ
  заказ (status сразу к генерации, без оплаты), `parent_order_id=orderId`, выставить у оригинала
  `regen_used=true`, запустить `processOrder`. Письмо с новым файлом уходит как обычно.
- UI: на `/account` форма повторной генерации (БЕЗ карточек тарифов, БЕЗ выбора оплаты, email из
  сессии). Бейдж «Вторая генерация активна».

### 4.9 Чистка
- Логин-токены и сессии с истёкшим `expires_at` — добавить в существующий cron-скрипт или новый
  `scripts/cleanup-auth.mjs` (best-effort DELETE). Не критично для Фазы 1, но желательно.

---

## 5. Безопасность (обязательно соблюсти)
- Токены логина: хранить только sha256-хэш, одноразовые, TTL 30 мин.
- Cookie сессии: httpOnly, Secure, SameSite=Lax.
- Anti-enumeration на /api/auth/request (одинаковый ответ есть/нет email).
- Доступ к /account и /api/regenerate только по валидной сессии; заказы фильтровать по user_id.
- Никаких паролей в письмах/логах.

---

## 6. Тесты (минимум)
- `lib/auth.ts`: создание/потребление токена (одноразовость, истечение), сессии. Стиль — как
  существующие тесты с подменой `@/lib/db`. Дописать новый тест-файл в `package.json` script `test`
  (обе строки).
- Проверить, что `npm run build`, `npm run typecheck`, `npm test` зелёные.

---

## 7. Деплой (выполняет владелец вручную, НЕ исполнитель)
```
git pull && npm install && \
psql "$DATABASE_URL" -f db/migrations/004_users.sql && \
npm run build && pm2 restart slidemaker
```
Новые env (если добавлены) прописать в `.env.local` на VPS.

## 8. Что НЕ делать в Фазе 1
- Админку и админ-панель (Фаза 2).
- Безлимитную бесплатную генерацию (только 1/заказ, пока владелец не подтвердит обратное).
- Менять существующую логику истории 1 / loader / SEO.
