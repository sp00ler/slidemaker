# Fable 5 — Wave 1 Status / QA Handoff

Дата обновления: 2026-07-03  
Формат: Markdown handoff для ревью Fable 5

## 1. Executive summary

Wave 1 по основным задачам закрыта на уровне кода и локальных проверок исполнителей.

Текущий общий статус:

- **T1 / Opus 4.8 — pptx-рендер:** реализовано, затем расширено T4a под `DesignSpec`, academic-пресет, кастомные шрифты/палитры и title modes.
- **T2 / Sonnet 5 — prompts + visuals:** реализовано; добавлены ограничения на визуалы, Mermaid, палитру, плотность текста и workType-блоки для ВКР/курсовой.
- **T3 / Codex — docx tables → Markdown:** реализовано.
- **T4a / Opus 4.8 — DesignSpec + academic renderer:** закрыто, build/typecheck/test зелёные.
- **T4b / Sonnet 5 — DesignSpec in prompt + workType structure:** закрыто.
- **T4d / Sonnet 5 — UI DesignPreview:** закрыто, build/typecheck/test зелёные.
- **T4e / Sonnet 5 — UI controls polish:** закрыто; доработаны поля шрифтов, размеров, цветов, подложек и Office-тем.
- **Codex — promo discount flow:** закрыто; добавлена частичная скидка промокодом, миграция БД и тесты.
- **T6 / Haiku QA:** выполнен код-аудит Wave 1; код оценён как готовый к реальному тестированию, но API/заказный сценарий ранее блокировался конфигом БД.

Итоговая оценка Haiku QA: **8.5/10**.  
Актуальная проверка Codex после promo-flow: **`npm test` — 50/50 pass**.  
Главный production-риск: **перед продом нужна миграция `007_promo_discount.sql`**.

## 2. T1 — Opus 4.8: pptx render

Файл: `lib/pptx.ts`

### Реализовано

- `parseImageSize` читает натуральные размеры PNG через IHDR и JPEG через SOF-маркеры.
- `fitContain` вписывает изображения и диаграммы в регион с сохранением аспекта и центрированием.
- Применено для diagram, image, Mermaid, Pexels, `gpt-image`, пользовательских загрузок.
- Caption вынесен под полный регион: `region.y + region.h`, без наложения на изображение.
- Добавлены 3 content-layout варианта: `top-bar`, вертикальная полоса слева, accent-блок под заголовком.
- Ротация layout: `index % 3`, соседние слайды отличаются.
- Section-слайды переработаны: светлый фон `t.bg`, крупный accent-bar, полупрозрачный номер секции, заголовок `t.heading`, без 100% цветной заливки.
- Убран долг `FFFFFFCC`: белый текст на accent-фоне больше не используется.

### Проверки Opus 4.8

- `tsc --noEmit` — чисто.
- Изолированные pptx-тесты — `3/3 pass`.
- Позже T4a сообщил чистое состояние: build exit `0`, `45/45` tests pass.

## 3. T2 — Sonnet 5: prompts and visuals

Файлы: `lib/anthropic.ts`, `lib/visuals.ts`

### Реализовано

- Приоритет visual-типа: `chart`, `diagram`, `photo`, затем `image`.
- `image` используется только когда остальные visual-типы не подходят.
- `image_prompt` требует light background, flat/minimal editorial illustration, no photorealism, no dark scenes, hex-акцент палитры.
- Mermaid: максимум 10 узлов; если узлов больше 5 → `direction LR`; подписи узлов ≤ 4 слов.
- Палитра: не дефолтный синий; accent не используется как заливка всего слайда, включая section.
- Текст: больше цифр и терминов, меньше общих формулировок.
- `buildImagePrompt()` в `lib/visuals.ts` добавляет защитный style suffix поверх любого `image_prompt` от модели.
- `deck.palette.accent` прокинут через `resolveDeckVisuals`, `resolveVisual`, `generatedImage`.

### Проверки Sonnet 5

- Build — зелёный.
- Typecheck — зелёный.
- `anthropic.test.js` — чисто во всех прогонах.
- Старые checkout-флапы на раннем этапе позже ушли в общем дереве.

## 4. T3 — Codex: DOCX tables to Markdown

Файлы: `lib/docx.ts`, `lib/__tests__/docx.test.ts`

### Реализовано

- Добавлен парсинг `w:tbl / w:tr / w:tc`.
- Таблицы из `.docx` конвертируются в Markdown-таблицы до общего удаления XML-тегов.
- Добавлены лимиты `maxTables`, `maxTableRows`, `maxTableCells`.
- Экранируется `|` внутри ячеек.
- Первая строка таблицы считается заголовком Markdown-таблицы.
- Добавлен тест на конвертацию таблицы в Markdown и сохранение порядка абзацев.

### Проверки Codex

- `npm run build` — прошёл.
- `npm run typecheck` — прошёл.
- Точечный `docx.test.ts` — `6/6 pass`.

### Риски Codex

- Regex-парсер WordprocessingML лёгкий.
- Merged/nested tables могут упроститься.
- Первая строка всегда трактуется как заголовок.

## 5. T4a — Opus 4.8: DesignSpec + academic renderer

Файл: `lib/pptx.ts`

### Статус

**Закрыто.**

Opus 4.8 сообщил:

- чистый build: exit `0`;
- `45/45` тестов pass;
- старые checkout-фейлы ушли после подтягивания параллельной работы в дереве.

### Реализовано

- Экспортирован тип `DesignSpec`.
- `DesignSpec` покрывает подмножество будущего `orders.prefs`: `preset`, `workType`, `title`, `fonts`, `palette`.
- Добавлена функция `themeFromPrefs(base, prefs) → Style`.
- `themeFromPrefs` накладывает поверх пресета палитру, шрифты и размеры.
- Academic preset стартует с `ACADEMIC`: `bg: FFFFFF`, `ink: 1A1A1A`, `accent: 1F3A5F`.
- Шрифт-whitelist: `Times New Roman`, `Arial`, `Tahoma`, `Verdana`, `Calibri`; default: `Arial`.
- Невалидный `fontFace` → fallback.
- `auto/null` сохраняет старое поведение.

### Academic layouts

- all-caps центр-заголовок;
- accent-подчёркивание;
- 3 варианта ротации `index % 3`:
  - `academicNumbered` — нумерованные блоки с вертикальным accent-штрихом;
  - `academicTwoColumns` — двухколоночная сетка тонких 1pt-боксов;
  - `academicFramed` — единая тонкая рамка вокруг списка.
- При `hasImage` форсится numbered layout в левой части.
- Academic section/title: центр, all-caps, рамка / подчёркивание, без цветной заливки.

### Title mode

- `title.mode = "self"` → сгенерированный титул не рендерится.
- `title.mode = "upload"` → загруженный PNG/JPG вставляется первым слайдом.
- Загруженный title image вписывается по аспекту без обрезки.
- Merge чужого `.pptx` не реализован.
- Сигнатура `buildPptx(..., prefs?, titleImage?)`.
- Новые параметры опциональны.
- Caller `generate.ts` не тронут.

### Тесты T4a

Добавлено +3 pptx-теста:

- prefs override `fontFace`;
- academic все слайды `FFFFFF`;
- self-режим не рендерит титул: `3` слайда → `2`.

Изолированно: `6/6 pass`.

## 6. T4b — Sonnet 5: DesignSpec in prompt + workType structure

Файлы: `lib/anthropic.ts`, `lib/__tests__/anthropic.test.ts`

### Статус

**Закрыто.**

### Реализовано

- Заведён `DesignSpec` тип: `preset`, `workType`, `title`, `fonts`, `palette`.
- Параметр опциональный везде.
- Добавлена функция `buildWorkTypeBlock()`.

### WorkType behavior

Для `vkr` и `coursework` задан фиксированный порядок:

1. титул, если `title.mode = auto`;
2. цель + задачи;
3. проблема / объект;
4. этапы;
5. результат;
6. заключение.

Для `vkr`: строгие формулировки; цель должна быть измеримой; результат через «проведены», «созданы», «разработаны».  
Для `coursework`: тот же порядок, более мягкая формулировочная рамка.  
Для `report/generic`: поведение не тронуто.

### Тесты T4b

Покрыто тестами:

- порядок блоков через `indexOf ascending` для `vkr`;
- порядок блоков для `coursework`;
- title-block пропускается при `title.mode !== auto`;
- `report/generic` не задет;
- academic bullets;
- anglicism constraints;
- palette-lock с hex и без hex;
- top-up несёт academic + order-note.

## 7. T4d — Sonnet 5: UI DesignPreview

Файл: `app/page.tsx`

### Статус

**Закрыто.**

Sonnet сообщил:

- build — зелёный;
- typecheck — чистый;
- tests — `47/47 pass`.

### Реализовано

- Добавлен `DesignPreview` — живой CSS-мокап слайда 16:9.
- Чистый React state, ноль сетевых запросов.
- Мгновенная реакция на `preset`, `headingFace`, `bodyFace`, `headingSize`, `bodySize`, `bg`, `text`, `accent`.
- Размеры шрифтов: `pt → px` в мокапе через коэффициент `×0.42`.

### Preview modes

#### academic

- белый фон;
- all-caps центр-заголовок;
- accent-подчёркивание;
- 3 нумерованные строки с вертикальным штрихом;
- подпись: «Стиль по умолчанию — академический».

#### custom

- палитра, шрифты и размеры из state;
- левый заголовок;
- маркеры-точки accent.

#### auto

- заглушка: «ИИ подберёт палитру и шрифты под вашу тему».

### UI integration

- Дисклеймер под всеми вариантами: «Превью схематично — реальный слайд оформляется точнее».
- Мокап размещён рядом с кнопками preset через grid `repeat(auto-fit, minmax(240px,1fr))`.
- На широком экране стоит рядом, на узком складывается в колонку.
- `globals.css` на T4d не менялся.

## 8. T4e — Sonnet 5: UI controls polish

Файлы: `app/page.tsx`, `app/globals.css`

### Статус

**Закрыто.**

### Реализовано

- Добавлены раздельные поля:
  - шрифт заголовков;
  - шрифт текста.
- Для каждого поля шрифта добавлен серый `field-hint`: что это за шрифт и для чего он используется.
- Добавлены раздельные поля:
  - размер заголовков, pt;
  - размер текста, pt.
- Hint для размера текста: «для аудитории обычно ≥24pt».
- Hint для размера заголовков: «крупно — читаемо с задних рядов».
- Цвета оформлены как `<input type="color">` + текстовый hex рядом, класс `.color-field`.
- Лейблы цветов приведены точно по брифу:
  - «Фон слайда (подложка)»;
  - «Цвет текста»;
  - «Акцентный цвет — линии, номера».
- У каждого color-control добавлен hint.
- Добавлены подложки:
  - 4 круглых swatch: Белый, Слоновая кость, Светло-серый, Тёплая бумага;
  - клик по swatch → `paletteBg`;
  - active-обводка при совпадении.
- Office-плитки:
  - 3 цветовых кружка вместо hex-подписи: bg, text, accent;
  - hint: «нажмите — цвета подставятся выше»;
  - active-подсветка выбранной темы;
  - `activeOffice` state;
  - activeOffice сбрасывается при ручном вводе цвета.

## 9. Codex — promo discount flow

Файлы:

- `db/migrations/007_promo_discount.sql`
- `db/schema.sql`
- `scripts/gen-promo.mjs`
- `lib/promo.ts`
- `app/api/checkout/route.ts`
- `lib/__tests__/order-wishes-storyboard.test.ts`

### Статус

**Закрыто, без коммита.**

### Реализовано

#### Database

В `db/migrations/007_promo_discount.sql`:

- добавлена колонка `discount_percent`;
- тип: `int`;
- `NOT NULL`;
- `DEFAULT 100`;
- `CHECK (1..100)`.

В `db/schema.sql` схема `promo_codes` синхронизирована с миграцией.

#### Promo generator

В `scripts/gen-promo.mjs`:

- добавлен третий аргумент скидки;
- значение по умолчанию: `100`;
- пример:

```bash
node scripts/gen-promo.mjs 5 SALE 30
```

#### Promo redeem

В `lib/promo.ts`:

```ts
redeemPromo() => { redeemed, discountPercent }
```

#### Checkout

В `app/api/checkout/route.ts`:

- 100% промо сохраняет bypass оплаты.
- Частичная скидка создаёт платёж на сумму:

```ts
max(1, round(price * (100 - discountPercent) / 100))
```

- Ответ API отдаёт:
  - `discountPercent`;
  - `amountRub`.

#### Tests

В `lib/__tests__/order-wishes-storyboard.test.ts` добавлены тесты на:

- частичную скидку;
- бесплатный промокод;
- уже использованный промокод.

### Проверки Codex

- `npm run build` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed, `50/50`.

### Риски Codex

- Перед продом обязательно применить миграцию `007_promo_discount.sql`.
- В дереве есть посторонние старые dirty/untracked файлы: `CLAUDE.md`, `app/page.tsx`, `design/.agents` и другие.
- Codex сообщил, что эти dirty/untracked файлы не трогал.

## 10. T6 — Haiku QA full audit

### Общий вердикт

Haiku провёл полный аудит Wave 1.

Оценка: **код готов к тестированию — 8.5/10.**

### T1 QA: pptx-render

| Требование | Статус | Примечание |
|---|---:|---|
| `fitContain` диаграмм/картинок с сохранением аспекта | ✓ | Функция есть, центрирует в регион |
| Подпись под полным регионом | ✓ | `addCaption y: region.y + region.h + 0.12` |
| 3+ детерминированных layout, ротация по индексу | ✓ | `contentLayout switch(variant % 3)` |
| Section: светлый фон + крупный accent-элемент | ✓ | `renderSection: bg = t.bg`, вертикальный bar |
| Убрать `FFFFFFCC` → `FFFFFF` + transparency | ⚠️ | Поиск в коде не показал `FFFFFFCC` |

Оценка T1: **9/10**.

### T2 QA: prompts / visuals

| Требование | Статус | Примечание |
|---|---:|---|
| `image_prompt`: light bg, flat/minimal, no dark | ✓ | `buildImagePrompt` содержит style-константу |
| Mermaid: LR при >5 узлов | ✓ | Prompt-строка содержит правило `узлов >5 → direction LR` |
| Mermaid ≤10 узлов, подписи ≤4 слов | ✓ | Есть prompt-требование |
| Приоритет photo/chart/diagram над image | ✓ | `resolveVisual switch` по типу |
| Палитра: hex в prompt | ✓ | `buildImagePrompt` получает `accent` |
| Плотнее текст, меньше воды | ⚠️ | Есть в prompt, но не гарантируется моделью |

Оценка T2: **8/10**.

### T3 QA: tables

| Требование | Статус | Примечание |
|---|---:|---|
| Парсить `w:tbl → w:tr → w:tc` | ✓ | `tableToMarkdown` regex |
| Вывод Markdown-таблицы | ✓ | Построение строк вида `| a | b |` |
| Лимиты таблиц / строк / ячеек | ✓ | `maxTables`, `maxTableRows`, `maxTableCells` |
| Порядок с абзацами сохранён | ✓ | `xmlToText` заменяет `</w:p>` на `\n` |

Оценка T3: **9/10**.

## 11. Cross-wave risks

| Риск | Влияние | Действие |
|---|---:|---|
| DB auth fail ранее блокировал API/E2E | High | Проверить актуальный `.env`, `DATABASE_URL`, POSTGRES credentials |
| Перед продом нужна миграция `007_promo_discount.sql` | High | Применить миграцию до деплоя checkout/promo |
| В дереве есть старые dirty/untracked файлы | High | Перед коммитом проверить `git status` и отделить чужие изменения |
| Модель может игнорировать prompt constraints T2 | Medium | Проверить реальные выходы |
| `tableToMarkdown` regex может неверно обработать вложенные таблицы | Low | Протестировать на `.docx` с вложенными таблицами |
| Opacity/transparency в section-слайде может быть зажата в 8-bit hex | Low | Проверить экспорт `.pptx` |
| Merge чужого `.pptx` для title upload не реализован | Low/Medium | Зафиксировать как out of scope или отдельную задачу |
| `DesignSpec` есть в коде, но БД/caller ещё не полностью дожаты | Medium | T4c должен связать `orders.prefs` с генерацией, если ещё не сделано |
| Частичная скидка создаёт платёж минимум на 1 рубль | Low/Medium | Проверить, что это согласовано с бизнес-логикой |

## 12. Required real verification

Нужен реальный тест заказа:

1. Проверить `.env`: `DATABASE_URL`, POSTGRES credentials.
2. Применить миграцию `db/migrations/007_promo_discount.sql`.
3. Запустить тестовый заказ.
4. Протестировать промокоды: 100%, частичная скидка, использованный промокод.
5. Сгенерировать deck.
6. Экспортировать `.pptx`.
7. Снять screenshots.
8. Проверить визуально:
   - вертикальные flowchart не сжимаются;
   - соседние слайды реально отличаются layout;
   - section-слайд светлый, без full-bleed заливки;
   - картинки светлые, flat/minimal, не тёмные и не photorealistic;
   - таблицы из `.docx` конвертируются в Markdown корректно;
   - academic-пресет действительно выглядит академически;
   - custom preview совпадает с ожидаемой логикой prefs;
   - title.mode `self/upload/auto` работает по сценарию;
   - T4e controls удобны и не ломают responsive layout.

## 13. Acceptance criteria for Fable review

Перед коммитом Fable стоит проверить:

- [ ] Diff соответствует заявленным файлам.
- [ ] Нет незаявленных изменений вне:
  - `lib/pptx.ts`;
  - `lib/anthropic.ts`;
  - `lib/visuals.ts`;
  - `lib/docx.ts`;
  - `lib/promo.ts`;
  - `app/page.tsx`;
  - `app/globals.css`;
  - `app/api/checkout/route.ts`;
  - `db/migrations/007_promo_discount.sql`;
  - `db/schema.sql`;
  - `scripts/gen-promo.mjs`;
  - `lib/__tests__/pptx.test.ts`;
  - `lib/__tests__/anthropic.test.ts`;
  - `lib/__tests__/docx.test.ts`;
  - `lib/__tests__/order-wishes-storyboard.test.ts`.
- [ ] `npm run typecheck` зелёный.
- [ ] `npm run build` зелёный.
- [ ] `npm test` зелёный: актуальный reported status — `50/50 pass`.
- [ ] `git status` проверен; старые dirty/untracked файлы отделены от коммита.
- [ ] `.env` исправлен до API/E2E теста.
- [ ] Миграция `007_promo_discount.sql` применена перед prod.
- [ ] Проверен checkout с 100% промо.
- [ ] Проверен checkout с частичным промо.
- [ ] Проверен checkout с уже использованным промо.
- [ ] Проверен реальный `.pptx` экспорт.
- [ ] Проверены screenshots.
- [ ] Зафиксировано, что T4c / DB caller integration либо сделан, либо вынесен отдельным тикетом.

## 14. Suggested Fable commit message

```text
feat: improve deck design controls, rendering, visuals, and promo discounts
```

Более подробный вариант:

```text
feat(deck): add academic design prefs, safer visuals, docx tables, and promo discounts

- preserve image and diagram aspect ratio in pptx export
- rotate deterministic content layouts
- redesign section slides without full accent fill
- add DesignSpec/theme prefs and academic layouts
- support title self/upload modes
- tighten visual prompts and generated image style constraints
- enforce Mermaid size/direction constraints in prompts
- convert DOCX WordprocessingML tables to Markdown
- add live design preview and polished design controls
- add promo discount_percent migration and partial-discount checkout flow
- extend regression coverage for pptx, anthropic prompts, docx tables, and promo checkout
```

## 15. Message to Fable

```text
Wave 1 is ready for review.

Reported green checks:
- T4a: build exit 0, 45/45 tests pass.
- T4d: build pass, typecheck clean, 47/47 tests pass.
- T4e: UI controls polish done in app/page.tsx + app/globals.css.
- Codex promo-flow: build pass, typecheck pass, npm test 50/50.
- Codex docx tests: 6/6 pass.
- Sonnet anthropic tests: clean in isolated runs.

Haiku QA verdict: code ready for real testing, 8.5/10.

Important blockers / risks:
- Apply db/migrations/007_promo_discount.sql before production.
- Check current .env / DATABASE_URL / POSTGRES credentials because DB auth previously blocked API/E2E QA.
- There are old dirty/untracked files in the tree; verify git status and avoid mixing unrelated files into the commit.

Please review diff, verify no unrelated files changed, run one real order → checkout with 100% promo + partial promo → PPTX export → screenshots before final merge.
```

## 16. Basis and limitations

This file is based only on the pasted reports from:

- Opus 4.8;
- Sonnet 5;
- Codex;
- Haiku.

Repository state, actual diff, `.env`, database connection, generated `.pptx`, screenshots and runtime API behavior were **not independently verified** in this chat.