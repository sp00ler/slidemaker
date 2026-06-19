# SlideMaker

MVP веб-приложения для генерации презентаций: тема → оплата → готовый `.pptx` на почту.

**Стек:** Next.js 14 (App Router) · PostgreSQL · pptxgenjs · Anthropic SDK · Nodemailer · ЮКасса

---

## Флоу

1. Лендинг с выбором тарифа и формой (email, тема, кол-во слайдов, стиль).
2. `POST /api/checkout` — создаёт заказ (`status=pending`) и платёж в ЮКассе, возвращает ссылку на оплату.
3. Пользователь платит → ЮКасса шлёт вебхук `POST /api/webhook/yukassa`.
4. Вебхук перепроверяет платёж по API, атомарно «захватывает» заказ (`status=generating`) и в фоне запускает генерацию.
5. Генерация: `claude-sonnet-4-6` → JSON структура слайдов → `pptxgenjs` собирает `.pptx` → `/public/downloads/{order_id}.pptx`.
6. Заказ помечается `done`, Nodemailer шлёт письмо со ссылкой.
7. Страница `/success` опрашивает `/api/status` и показывает кнопку скачивания.

---

## Тарифы

| Тариф    | Цена   | Слайдов |
|----------|--------|---------|
| Базовый  | 299 ₽  | до 9    |
| Стандарт | 499 ₽  | до 15   |

---

## Что вписать в ENV (про твои вопросы)

Файл `.env.local` уже создан. Три значения нужно заполнить:

### `DATABASE_URL` — строка подключения к PostgreSQL

Это адрес базы данных в одном формате:
```
postgresql://ПОЛЬЗОВАТЕЛЬ:ПАРОЛЬ@ХОСТ:ПОРТ/ИМЯ_БАЗЫ
```
На **Beget**: панель → «Базы данных» (или PostgreSQL) → создать базу. Beget выдаст
имя базы, пользователя и пароль. Хост обычно `localhost` (если приложение на том же
VPS) и порт `5432`. Пример:
```
DATABASE_URL=postgresql://slidemaker_user:Abc123@localhost:5432/slidemaker_db
```

### `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` — почта для отправки писем

Ты вписал в `SMTP_HOST` адрес `payment@slidemaker.ru` — это **email-ящик**, а не хост.
Их нужно разделить:

- `SMTP_HOST` — адрес почтового сервера. На Beget это `smtp.beget.com` (порт `465`, SSL).
- `SMTP_USER` — **полный адрес ящика**, который создаёшь в панели Beget → «Почта»
  (например `no-reply@slidemaker.ru` или `payment@slidemaker.ru`).
- `SMTP_PASS` — **пароль от этого ящика**, который ты задаёшь при его создании.

Письма уходят от `MAIL_FROM` (по умолчанию `no-reply@slidemaker.ru`). Адрес отправителя
должен совпадать с доменом ящика, иначе письма попадут в спам.

---

## Запуск локально

```bash
npm install
# заполнить .env.local (DATABASE_URL, SMTP_*)
psql "$DATABASE_URL" -f db/schema.sql   # создать таблицу orders
npm run dev
```
Открыть http://localhost:3000

## Прод (Beget VPS)

```bash
npm install
npm run build
npm run start         # next start, порт 3000 (persistent Node-процесс)
```
Поставь перед приложением Nginx с SSL (домен `slidemaker.ru`) и проксируй на `:3000`.
Рекомендуется запускать через `pm2` или systemd, чтобы процесс не падал.

> Генерация идёт в фоне после ответа `200` вебхуку — это работает только потому,
> что `next start` — постоянный Node-процесс (не serverless).

## Очистка скачиваний

Сгенерированные `.pptx` лежат в `public/downloads`. TTL — это срок жизни ссылки
на скачивание; после удаления старые ссылки из писем и `/success` будут отдавать 404.

Запускать из корня проекта, например ежедневно по cron:
```bash
DOWNLOADS_TTL_DAYS=7 npm run cleanup:downloads
```

Первый CLI-аргумент перекрывает env:
```bash
npm run cleanup:downloads -- 14
```

---

## Настройка ЮКассы

1. В ЛК ЮКассы → «Интеграция» → HTTP-уведомления укажи URL вебхука:
   `https://slidemaker.ru/api/webhook/yukassa`, событие **payment.succeeded**.
2. `YUKASSA_SHOP_ID` и `YUKASSA_SECRET_KEY` уже прописаны (тестовый магазин).
   Для приёма реальных платежей замени на боевые ключи.
3. **54-ФЗ / чеки:** для боевого режима ЮКасса часто требует данные чека (`receipt`).
   В MVP чек не передаётся — добавь объект `receipt` в `lib/yookassa.ts` при включении
   фискализации.

---

## Структура

```
app/
  page.tsx                     лендинг + форма
  success/page.tsx             статус заказа после оплаты
  api/checkout/route.ts        создание заказа + платежа
  api/webhook/yukassa/route.ts приём оплаты → запуск генерации
  api/status/route.ts          статус заказа для страницы success
lib/
  tariffs.ts                   тарифы и стили
  db.ts                        пул PostgreSQL
  orders.ts                    запросы к таблице orders
  yookassa.ts                  создание/проверка платежа
  anthropic.ts                 генерация структуры слайдов (JSON)
  pptx.ts                      сборка .pptx (3 темы оформления)
  mailer.ts                    отправка письма
  generate.ts                  оркестрация: текст → pptx → письмо
db/schema.sql                  таблица orders
```

---

## ⚠️ Безопасность ключей

`ANTHROPIC_API_KEY` и секрет ЮКассы были переданы открытым текстом в переписке —
считай их скомпрометированными. **Перевыпусти `ANTHROPIC_API_KEY`** в консоли Anthropic
после запуска. `.env.local` добавлен в `.gitignore` и в репозиторий не попадёт.
