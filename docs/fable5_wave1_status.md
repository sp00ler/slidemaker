# Fable 5 — Wave 1 Status / Handoff

Основано на отчётах Opus 4.8, Sonnet 5, Codex и Haiku, предоставленных пользователем. Внешняя проверка репозитория не выполнялась. Файл предназначен как единый Markdown-handoff для ревью и дальнейшей координации Fable 5.

---

## 1. Краткое резюме

Wave 1 по визуальному рендеру, промптам, генерации визуалов и импорту таблиц в Markdown в целом реализована.

Закрытые направления:

- **T1 / PPTX renderer** — исправлены искажения изображений, подписи, секционные слайды и вариативность content-layout.
- **T2 / Anthropic prompts + visuals** — усилены промпты для визуального выбора, Mermaid, image generation и цветовой согласованности.
- **T3 / DOCX tables to Markdown** — добавлена конвертация таблиц WordprocessingML в Markdown-таблицы.
- **T6 / QA audit** — код-аудит подтверждает наличие ключевых реализаций, но полноценный QA заблокирован окружением.

Общий статус: **готово к ревью Fable, но не полностью готово к финальному QA из-за проблем окружения и pre-existing checkout-тестов**.

---

## 2. Статус по задачам

| Задача | Исполнитель | Статус | Комментарий |
|---|---:|---|---|
| T1: PPTX render fixes | Opus 4.8 | Закрыто | Fit-contain, captions, content-layout rotation, section redesign реализованы |
| T2: Prompts + visuals | Sonnet 5 | Закрыто | Усилены system/build prompts, image prompt suffix, palette propagation |
| T3: DOCX tables to Markdown | Codex | Закрыто | WordprocessingML tables конвертируются в Markdown |
| T6: QA audit | Haiku | Частично | Код-аудит пройден, API/browser QA заблокирован |
| Checkout/order tests | Не Wave 1 scope | Не закрыто | 3 старых фейла остаются вне текущего скоупа |

---

## 3. T1 — PPTX renderer

### Изменённый файл

- `lib/pptx.ts`

### Реализовано

1. **Fit-contain для изображений и диаграмм**
   - `parseImageSize` читает натуральные размеры PNG через `IHDR`.
   - JPEG читается через `SOF`-маркеры.
   - `fitContain` вписывает изображение в регион с сохранением aspect ratio.
   - Изображение центрируется внутри региона.
   - Исправляет проблему «сплющивания» diagram/image, включая:
     - Mermaid;
     - Pexels;
     - `gpt-image`;
     - пользовательские загрузки.

2. **Caption вынесен под полный регион**
   - Caption теперь ставится по `region.y + region.h`.
   - Caption не должен накладываться поверх изображения.
   - Закрывает замечание по `photo_4`.

3. **Три content-layout варианта**
   - Добавлен `contentLayout`.
   - Варианты:
     - `top-bar`;
     - вертикальная полоса слева;
     - accent-блок под заголовком.
   - Ротация: `index % 3`.
   - Соседние слайды должны визуально отличаться.

4. **Section slide без 100% accent-заливки**
   - Светлый фон: `t.bg`.
   - Крупный accent-bar.
   - Полупрозрачный номер секции.
   - Заголовок в `t.heading`.
   - Убран разреженный tracking.
   - Закрывает замечание по `photo_8`.

5. **Долг `FFFFFFCC` устранён**
   - Белый текст на accent-фоне убран из section-дизайна.
   - Используется `t.text`.

### Тесты

Файл:

- `pptx.test.ts`

Добавлено:

- регресс на сохранение аспекта: `100×200 → w/h≈0.5`;
- регресс на чередование layout.

Результат точечного прогона:

- `3/3 pass`.

### Проверки

- `tsc --noEmit` — чисто.
- isolated `pptx` tests — `3/3 pass`.
- полный `npm test` — падает в 3 старых checkout/order tests.
- `npm run build` — компиляция прошла, но финально упала на Windows `EBUSY copyfile .next/.../404.html`.

### Вывод по T1

Кодовая часть T1 выполнена. Проблемы полного build/test выглядят связанными не с T1, а с окружением или pre-existing checkout WIP.

---

## 4. T2 — Anthropic prompts + visuals

### Изменённые файлы

- `lib/anthropic.ts`
- `lib/visuals.ts`

### Реализовано в `lib/anthropic.ts`

Изменены:

- system prompt;
- `buildDeckPrompt`;
- `buildTopUpPrompt`.

Ключевые правила:

1. **Приоритет visual-типов**
   - `chart` / `diagram` / `photo` выше, чем `image`.
   - `image` используется только когда другие варианты не подходят.

2. **Требования к `image_prompt`**
   - светлый фон;
   - flat/minimal editorial illustration;
   - запрет photorealism;
   - запрет dark scenes;
   - палитра должна учитывать hex-акцент колоды.

3. **Mermaid-ограничения**
   - максимум 10 узлов;
   - если узлов больше 5 — использовать `direction LR`;
   - подписи узлов не длиннее 4 слов.

4. **Палитра**
   - не использовать дефолтный синий как основной визуальный стиль;
   - accent не должен становиться заливкой всего слайда, включая section.

5. **Текст**
   - больше конкретики: цифры, термины, фактура;
   - меньше общей воды.

### Реализовано в `lib/visuals.ts`

1. **Defense-in-depth для image generation**
   - `buildImagePrompt()` добавляет жёсткий style suffix поверх любого `image_prompt` от модели.
   - Suffix включает:
     - light background;
     - flat/minimal style;
     - no photorealism;
     - no dark scenes.

2. **Проброс палитры**
   - `deck.palette.accent` прокинут через:
     - `resolveDeckVisuals`;
     - `resolveVisual`;
     - `generatedImage`.
   - Цель: generated image визуально попадает в тон колоды.

### Проверки

- `npm run build` — зелёный.
- `typecheck` — зелёный.
- tests — `31/34`.
- 3 фейла — `order-wishes-storyboard.test.js`, checkout area.
- baseline после `git stash` показывает аналогичные флапы/фейлы.
- `anthropic.test.js` — чисто во всех прогонах.

### Вывод по T2

T2 реализована. Наблюдаемые тестовые фейлы не относятся к изменённым файлам T2 и выглядят как pre-existing / Windows FS / checkout harness проблема.

---

## 5. T3 — DOCX tables to Markdown

### Изменённые файлы

- `lib/docx.ts`
- `lib/__tests__/docx.test.ts`

### Реализовано

`lib/docx.ts` теперь конвертирует `w:tbl` из `.docx` в Markdown-таблицы до общего удаления XML-тегов.

Добавлено:

1. **Парсинг WordprocessingML tables**
   - `w:tbl`;
   - `w:tr`;
   - `w:tc`.

2. **Лимиты безопасности/контроля объёма**
   - `maxTables`;
   - `maxTableRows`;
   - `maxTableCells`.

3. **Markdown escaping**
   - экранирование `|` внутри ячеек.

4. **Сохранение порядка контента**
   - тест проверяет, что таблица превращается в Markdown;
   - порядок абзацев сохраняется.

### Поведение

- Первая строка таблицы считается заголовком Markdown-таблицы.
- Merged/nested tables могут упроститься, так как используется лёгкий regex-парсер WordprocessingML.

### Проверки

- `npm run build` — прошёл.
- `npm run typecheck` — прошёл.
- точечный `docx.test.ts` — `6/6 pass`.
- полный `npm test` — docx tests прошли, но общий прогон падает на 3 старых checkout-тестах:
  - `Cannot find module ... .test-dist/.../lib/generate`.

### Вывод по T3

T3 реализована и покрыта точечным тестом. Риск остаётся для сложных Word tables: merged cells, nested tables, нестандартная структура XML.

---

## 6. T6 — QA status

### Код-аудит Haiku

По отчёту Haiku, код-аудит подтверждает реализацию ключевых требований.

#### T1 подтверждено

- `fitContain` сохраняет аспект диаграмм/картинок.
- `contentLayout` содержит 3 варианта layout и ротацию по индексу.
- `renderSection` использует светлый фон и вертикальный бар, а не full-bleed заливку.
- `addCaption` ставит подпись под регионом.

#### T2 подтверждено

- `buildImagePrompt` добавляет light background, flat/minimal, no dark scenes и палитру.
- Mermaid `LR` при >5 узлов присутствует в prompt.
- `photo/chart` имеют приоритет над `image`.

#### T3 подтверждено

- `tableToMarkdown` парсит `w:tr` / `w:tc` в Markdown.
- Лимиты `maxTables`, `maxTableRows`, `maxTableCells` присутствуют.

### Блокеры QA

1. **БД не авторизуется**
   - ошибка: `password auth failed`.
   - API-тесты невозможны до исправления `.env` / DB credentials.

2. **Невозможно снять скриншоты**
   - нет браузера в окружении.

3. **Wave 1 код не проверен end-to-end**
   - код есть;
   - полноценный тестовый заказ → экспорт PPTX → screenshots → визуальная оценка не выполнены.

### Вывод по T6

T6 не может быть закрыта как полноценный QA до восстановления окружения: БД, браузер/скриншоты, тестовый заказ, экспорт PPTX.

---

## 7. Известные проблемы вне Wave 1 scope

### 7.1 Checkout/order tests

Повторяющиеся фейлы:

- `order-wishes-storyboard.test.ts`
- `order-wishes-storyboard.test.js`
- checkout author/wishes/binds
- `Cannot find module ... .test-dist/.../lib/generate`

По отчётам:

- фейлы воспроизводятся даже после stash текущих изменений;
- значит, это не результат T1/T2/T3;
- вероятная зона ответственности: order-flow-v2 / checkout / transpile harness / Windows FS race.

### 7.2 Windows `.next` lock / EBUSY

Build у Opus упал на:

```text
EBUSY copyfile .next/.../404.html
```

Контекст:

- компиляция прошла;
- static pages: `10/10`;
- вероятная причина: Windows file lock, dev server или antivirus держит `.next`.

Рекомендуемая очистка перед повторным build:

```powershell
# закрыть npm run dev, если запущен
Remove-Item -Recurse -Force .next
npm run build
```

---

## 8. Риски

| Риск | Уровень | Комментарий |
|---|---:|---|
| Полный QA не выполнен | Высокий | Нет DB auth и браузера для screenshots |
| Checkout tests падают | Средний | Не Wave 1, но блокируют чистый общий `npm test` |
| DOCX table parser regex-based | Средний | Merged/nested tables могут упроститься |
| Build на Windows может ловить `.next` lock | Низкий/средний | Не похоже на кодовую ошибку |
| Mermaid complexity всё ещё зависит от модели | Средний | Prompt rule есть, но model compliance не гарантирован |
| Generated images зависят от провайдера | Средний | Defense-in-depth suffix снижает риск, но не исключает отклонения |

---

## 9. Что нужно сделать дальше

### Минимальный план для ревью Fable

1. Проверить diff по файлам:
   - `lib/pptx.ts`
   - `lib/anthropic.ts`
   - `lib/visuals.ts`
   - `lib/docx.ts`
   - `lib/__tests__/docx.test.ts`
   - `pptx.test.ts` / соответствующий путь теста.

2. Отдельно подтвердить, что изменения не смешаны с checkout/order-flow.

3. Прогнать targeted tests:

```bash
npm run typecheck
npm run build
npm test -- docx
npm test -- pptx
npm test -- anthropic
```

4. Зафиксировать, что общий `npm test` падает на pre-existing checkout tests, если это повторяется на чистом baseline.

5. После ревью — сделать commit Wave 1 отдельным atomic commit или несколькими commit по зонам:
   - `pptx-render-fixes`
   - `visual-prompts-and-palette`
   - `docx-table-markdown`

### Для полноценного QA

1. Исправить DB credentials в `.env`.
2. Поднять окружение с доступной БД.
3. Обеспечить браузер для screenshots.
4. Провести end-to-end сценарий:
   - создать тестовый заказ;
   - сгенерировать deck;
   - экспортировать PPTX;
   - проверить aspect ratio изображений;
   - проверить captions;
   - проверить section slides;
   - проверить visual variety соседних слайдов;
   - проверить таблицы из `.docx` во входных данных;
   - снять screenshots/экспортные артефакты.

---

## 10. Acceptance criteria для закрытия Wave 1

Wave 1 можно считать закрытой после выполнения следующих условий:

- [ ] `typecheck` проходит.
- [ ] `build` проходит в чистом окружении.
- [ ] targeted tests по T1/T2/T3 проходят.
- [ ] checkout/order фейлы либо исправлены, либо формально вынесены из scope с baseline-доказательством.
- [ ] DB auth исправлен.
- [ ] проведён хотя бы один end-to-end экспорт PPTX.
- [ ] визуально подтверждено, что изображения не сплющиваются.
- [ ] captions не накладываются на изображения.
- [ ] section slides не используют full accent fill.
- [ ] Mermaid diagrams с >5 узлами используют LR или визуально не ломают слайд.
- [ ] generated images имеют светлый/minimal стиль и не уходят в dark photorealism.
- [ ] DOCX таблицы попадают в Markdown в приемлемом виде.

---

## 11. Рекомендуемое сообщение архитектору / Fable

```text
Wave 1 по PPTX visual fixes, Anthropic/visual prompt hardening и DOCX table-to-Markdown реализована.

T1: исправлен fit-contain для PNG/JPEG, captions вынесены под region, добавлены 3 content-layout варианта, section slides больше не full-bleed accent.
T2: усилены prompt rules для visual priority, Mermaid LR при >5 узлов, light/minimal image generation, palette accent propagation.
T3: DOCX w:tbl конвертируются в Markdown-таблицы до удаления XML-тегов.

Targeted checks зелёные: typecheck/build в зонах T2/T3, pptx/docx/anthropic targeted tests проходят.
Полный npm test всё ещё падает на 3 checkout/order tests, которые воспроизводятся на baseline/stash и не относятся к Wave 1.
Полный QA заблокирован: DB password auth failed, нет браузера для screenshots.

Нужно ревью diff, затем либо commit Wave 1, либо сначала восстановить QA окружение для end-to-end проверки test order → PPTX export → screenshots.
```

---

## 12. Итоговый статус

**Wave 1: implemented, pending Fable review and environment-backed QA.**

Кодовые изменения по T1/T2/T3 выглядят завершёнными по отчётам исполнителей и подтверждены код-аудитом Haiku. Финальное закрытие зависит не от новой логики, а от:

- ревью Fable;
- исправления DB auth;
- возможности снять screenshots;
- решения или формального исключения старых checkout/order test failures.
