# Fable 5 — Wave 1 + T4 Status / Handoff

Основано на отчётах Opus 4.8, Sonnet 5, Codex и Haiku, предоставленных пользователем, включая дополнительные отчёты по T4a и T4b. Внешняя проверка репозитория не выполнялась. Файл предназначен как единый Markdown-handoff для ревью и дальнейшей координации Fable 5.

---

## 1. Краткое резюме

Wave 1 по визуальному рендеру, промптам, генерации визуалов и импорту таблиц в Markdown в целом реализована. Дополнительно закрыты T4a и T4b: добавлена поддержка `DesignSpec`/prefs на стороне PPTX-рендера и генерации prompt-структуры под тип работы.

Закрытые направления:

- **T1 / PPTX renderer** — исправлены искажения изображений, подписи, секционные слайды и вариативность content-layout.
- **T2 / Anthropic prompts + visuals** — усилены промпты для визуального выбора, Mermaid, image generation и цветовой согласованности.
- **T3 / DOCX tables to Markdown** — добавлена конвертация таблиц WordprocessingML в Markdown-таблицы.
- **T6 / QA audit** — код-аудит подтверждает наличие ключевых реализаций, но полноценный QA был заблокирован окружением на момент отчёта Haiku.
- **T4a / PPTX DesignSpec + academic layouts** — закрыто: prefs/theme overrides, academic layouts, title modes.
- **T4b / Anthropic DesignSpec + workType prompt rules** — закрыто: порядок блоков для ВКР/курсовой, academic prompt locks, tests.

Общий статус по последнему отчёту Opus: **чистый build, typecheck и 45/45 тестов pass**. Предыдущие checkout-фейлы ушли после подтягивания параллельной работы в дереве.

---

## 2. Статус по задачам

| Задача | Исполнитель | Статус | Комментарий |
|---|---:|---|---|
| T1: PPTX render fixes | Opus 4.8 | Закрыто | Fit-contain, captions, content-layout rotation, section redesign реализованы |
| T2: Prompts + visuals | Sonnet 5 | Закрыто | Усилены system/build prompts, image prompt suffix, palette propagation |
| T3: DOCX tables to Markdown | Codex | Закрыто | WordprocessingML tables конвертируются в Markdown |
| T6: QA audit | Haiku | Частично | Код-аудит пройден, API/browser QA заблокирован |
| Checkout/order tests | Параллельная зона | Закрыто по последнему отчёту | Предыдущие фейлы ушли; общий прогон 45/45 pass |
| T4a: PPTX DesignSpec / prefs / academic layouts | Opus 4.8 | Закрыто | build exit 0, 45/45 tests pass, targeted pptx 6/6 |
| T4b: Anthropic DesignSpec / workType prompt rules | Sonnet 5 | Закрыто | prompt-структура для vkr/coursework, academic locks, tests added |

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

## 7. T4a — PPTX DesignSpec, prefs и academic layouts

### Изменённый файл

- `lib/pptx.ts`

### Статус

По отчёту Opus 4.8: **T4a закрыт**. Последний общий прогон: чистый `build` с `exit 0`, тесты `45/45 pass`. Ранее наблюдавшиеся checkout-фейлы ушли после подтягивания параллельной работы в дереве.

### Реализовано

1. **Экспортирован `DesignSpec`**
   - тип описывает подмножество будущих `orders.prefs`;
   - поля: `preset`, `workType`, `title`, `fonts`, `palette`;
   - T4c должен дожать БД и caller.

2. **Добавлен `themeFromPrefs(base, prefs) → Style`**
   - накладывает палитру, шрифты и размеры поверх style preset;
   - `academic` стартует с `ACADEMIC`;
   - базовые цвета academic:
     - `bg = FFFFFF`;
     - `ink = 1A1A1A`;
     - `accent = 1F3A5F`;
   - `auto` / `null` сохраняют старое поведение.

3. **Шрифт-whitelist**
   - разрешены: `Times New Roman`, `Arial`, `Tahoma`, `Verdana`, `Calibri`;
   - default: `Arial`;
   - невалидный `fontFace` уходит в fallback.

4. **Academic layouts для examples `ex1` / `ex2`**
   - заголовок по центру в `ALL-CAPS`;
   - accent-подчёркивание;
   - 3 варианта с ротацией `index % 3`:
     - `academicNumbered` — нумерованные блоки с вертикальным accent-штрихом;
     - `academicTwoColumns` — двухколоночная сетка тонких `1pt`-боксов;
     - `academicFramed` — единая тонкая рамка вокруг списка;
   - при `hasImage` принудительно используется `numbered` в левой части, чтобы не ломать сетку из-за нехватки места.

5. **Academic Section / Title**
   - центрированный `ALL-CAPS`;
   - рамка / подчёркивание;
   - без цветной заливки.

6. **Title modes**
   - `title.mode = "self"` — сгенерированный титул не рендерится;
   - `title.mode = "upload"` — загруженный `PNG/JPG` ставится первым слайдом, вписывается по aspect ratio без обрезки;
   - merge чужого `.pptx` не реализовывался.

7. **Совместимость с Wave 1**
   - ротация `contentLayout` сохранена для non-academic;
   - сигнатура `buildPptx(..., prefs?, titleImage?)`;
   - новые параметры опциональны;
   - caller `generate.ts` не тронут;
   - компиляция проходит.

### Тесты

Файл:

- `pptx.test.ts`

Добавлено 3 теста:

- prefs override `fontFace`: `Times New Roman` / `Tahoma`, при этом `Calibri` не протекает в нецелевые места;
- academic slides имеют фон `FFFFFF`;
- `self`-режим не рендерит title slide: `3` слайда превращаются в `2`.

Результаты:

- targeted `pptx.test.ts` — `6/6 pass`;
- общий прогон — `45/45 pass`;
- `build` — `exit 0`;
- `typecheck` — зелёный.

### Вывод по T4a

T4a готов к ревью Fable. Основной открытый хвост не в `pptx.ts`, а в T4c: подключить сохранённые `orders.prefs` из БД и пробросить их в caller.

---

## 8. T4b — Anthropic DesignSpec и workType prompt rules

### Изменённые файлы

- `lib/anthropic.ts`
- `lib/__tests__/anthropic.test.ts`

### Статус

По отчёту Sonnet 5: **T4b готово**. Изменения касаются prompt-структуры и будущего чтения `orders.prefs`; параметры сделаны опциональными.

### Реализовано

1. **Заведён `DesignSpec`**
   - поля: `preset`, `workType`, `title`, `fonts`, `palette`;
   - предназначен для будущего чтения `orders.prefs`;
   - сейчас параметр опциональный во всех местах.

2. **Добавлен / усилен `buildWorkTypeBlock()`**

   Для `vkr` и `coursework` задаётся фиксированный порядок блоков:

   1. титул, если `title.mode = auto`;
   2. цель + задачи;
   3. проблема / объект;
   4. этапы;
   5. результат;
   6. заключение.

3. **Особенности `vkr`**
   - более строгие формулировки;
   - цель должна быть измеримой;
   - результат формулируется в стиле: `проведены`, `созданы`, `разработаны`.

4. **Особенности `coursework`**
   - используется тот же порядок блоков;
   - формулировки мягче, чем для `vkr`.

5. **Незатронутые режимы**
   - `report` не изменён;
   - `generic` не изменён.

6. **Academic locks в prompt**
   - academic bullets;
   - ограничение англицизмов;
   - palette lock с hex и без hex;
   - top-up prompt тоже несёт academic + order-note.

7. **Font whitelist**
   - whitelist в `prefs.fonts` описан на уровне типа;
   - фактический рендер шрифта выполняется в `pptx.ts`, не в `anthropic.ts`.

### Тесты

Файл:

- `lib/__tests__/anthropic.test.ts`

Добавлены проверки:

- порядок блоков через `indexOf ascending` для строгого `vkr`;
- порядок блоков через `indexOf ascending` для мягкого `coursework`;
- title-block пропускается при `title.mode !== auto`;
- `report` / `generic` не задеты;
- academic bullets / anglicism / palette-lock;
- top-up prompt содержит academic + order-note.

### Вывод по T4b

T4b готов к ревью Fable. Логика prompt-структуры подготовлена под будущий проброс `orders.prefs`; фактическое подключение БД/caller остаётся зоной T4c.

---

## 9. Известные проблемы вне Wave 1 / T4 scope

### 9.1 Checkout/order tests

Исторически наблюдавшиеся фейлы:

- `order-wishes-storyboard.test.ts`
- `order-wishes-storyboard.test.js`
- checkout author/wishes/binds
- `Cannot find module ... .test-dist/.../lib/generate`

По ранним отчётам:

- фейлы воспроизводились даже после stash текущих изменений;
- значит, это не было результатом T1/T2/T3;
- вероятная зона ответственности тогда: order-flow-v2 / checkout / transpile harness / Windows FS race.

По последнему отчёту Opus 4.8 после T4a:

- checkout-фейлы ушли;
- общий прогон тестов: `45/45 pass`.

### 9.2 Windows `.next` lock / EBUSY

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

## 10. Риски

| Риск | Уровень | Комментарий |
|---|---:|---|
| Полный QA не выполнен | Средний/высокий | По Haiku QA был заблокирован DB auth и отсутствием браузера; после T4a тесты зелёные, но end-to-end screenshots не подтверждены |
| Checkout tests падали ранее | Низкий/закрыто по последнему отчёту | Последний общий прогон: `45/45 pass` |
| DOCX table parser regex-based | Средний | Merged/nested tables могут упроститься |
| Build на Windows может ловить `.next` lock | Низкий | Ранее был EBUSY; последний build у Opus прошёл с exit 0 |
| Mermaid complexity всё ещё зависит от модели | Средний | Prompt rule есть, но model compliance не гарантирован |
| Generated images зависят от провайдера | Средний | Defense-in-depth suffix снижает риск, но не исключает отклонения |

---

## 11. Что нужно сделать дальше

### Минимальный план для ревью Fable

1. Проверить diff по файлам:
   - `lib/pptx.ts`
   - `lib/anthropic.ts`
   - `lib/visuals.ts`
   - `lib/docx.ts`
   - `lib/__tests__/docx.test.ts`
   - `lib/__tests__/anthropic.test.ts`
   - `pptx.test.ts` / соответствующий путь теста.

2. Отдельно подтвердить, что изменения не смешаны с checkout/order-flow.

3. Проверить T4 integration boundary:
   - `DesignSpec` совместим между `pptx.ts` и `anthropic.ts`;
   - `buildPptx(..., prefs?, titleImage?)` не ломает текущий caller;
   - T4c корректно подтянет `orders.prefs` из БД.

4. Прогнать targeted tests:

```bash
npm run typecheck
npm run build
npm test -- docx
npm test -- pptx
npm test -- anthropic
```

5. Подтвердить общий прогон `npm test`: по последнему отчёту ожидается `45/45 pass`.

6. После ревью — сделать commit отдельным atomic commit или несколькими commit по зонам:
   - `pptx-render-fixes`
   - `visual-prompts-and-palette`
   - `docx-table-markdown`
   - `designspec-prefs-academic-layouts`
   - `worktype-prompt-rules`

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

## 12. Acceptance criteria для закрытия Wave 1 + T4

Wave 1 можно считать закрытой после выполнения следующих условий:

- [ ] `typecheck` проходит.
- [ ] `build` проходит в чистом окружении.
- [ ] targeted tests по T1/T2/T3 проходят.
- [x] checkout/order фейлы ушли по последнему общему прогону `45/45 pass`.
- [ ] DB auth исправлен или подтверждено, что для текущего ревью он не нужен.
- [ ] проведён хотя бы один end-to-end экспорт PPTX.
- [ ] визуально подтверждено, что изображения не сплющиваются.
- [ ] captions не накладываются на изображения.
- [ ] section slides не используют full accent fill.
- [ ] Mermaid diagrams с >5 узлами используют LR или визуально не ломают слайд.
- [ ] generated images имеют светлый/minimal стиль и не уходят в dark photorealism.
- [ ] DOCX таблицы попадают в Markdown в приемлемом виде.
- [ ] `DesignSpec` не конфликтует между `pptx.ts` и `anthropic.ts`.
- [ ] academic preset визуально соответствует строгому учебному стилю: белый фон, тёмный текст, accent как линия/рамка, без full-bleed заливок.
- [ ] `title.mode = self/upload/auto` работает ожидаемо.
- [ ] `vkr/coursework` prompts сохраняют заданный порядок блоков.

---

## 13. Рекомендуемое сообщение архитектору / Fable

```text
Wave 1 + T4a/T4b готовы к ревью Fable.

Wave 1:
- T1: исправлен fit-contain для PNG/JPEG, captions вынесены под region, добавлены 3 content-layout варианта, section slides больше не full-bleed accent.
- T2: усилены prompt rules для visual priority, Mermaid LR при >5 узлов, light/minimal image generation, palette accent propagation.
- T3: DOCX w:tbl конвертируются в Markdown-таблицы до удаления XML-тегов.

T4a:
- В lib/pptx.ts экспортирован DesignSpec, добавлен themeFromPrefs(base, prefs), font whitelist, academic preset/layouts, title.mode self/upload, опциональная сигнатура buildPptx(..., prefs?, titleImage?).
- Academic: белый фон, тёмный текст, accent как подчёркивание/рамка/штрих, без полной цветной заливки.
- Targeted pptx: 6/6 pass. Общий build exit 0, общий test: 45/45 pass.

T4b:
- В lib/anthropic.ts заведён DesignSpec и buildWorkTypeBlock().
- Для vkr/coursework задан фиксированный порядок: титул при auto → цель+задачи → проблема/объект → этапы → результат → заключение.
- vkr строгий, coursework мягче; report/generic не тронуты.
- Добавлены тесты в anthropic.test.ts на порядок блоков, title.mode, academic locks и top-up.

Открытый следующий шаг:
- T4c: подключить orders.prefs из БД и пробросить prefs/titleImage в caller/generate path.
- После ревью сделать commit. Исполнители коммиты не делали по регламенту.
- End-to-end QA test order → PPTX export → screenshots всё ещё нужно подтвердить отдельно, если QA окружение доступно.
```

---

## 14. Итоговый статус

**Wave 1 + T4a/T4b: implemented, pending Fable review and T4c integration.**

Кодовые изменения по T1/T2/T3/T4a/T4b выглядят завершёнными по отчётам исполнителей. По последнему отчёту Opus 4.8 общий build чистый, общий test `45/45 pass`, предыдущие checkout-фейлы ушли.

Финальное закрытие зависит от:

- ревью Fable;
- коммита после ревью;
- T4c: подключения `orders.prefs` из БД и проброса в caller;
- environment-backed QA: test order → PPTX export → screenshots, если требуется визуальное подтверждение.
