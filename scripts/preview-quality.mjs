import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "tmp", "quality-preview");
const runtimeDir = path.join(outDir, "runtime");
const ts = require("typescript");

// pptx.ts imports these modules only as types. Transpile just this file so the
// preview executes the production renderer without loading the app or its APIs.
const source = await fs.readFile(path.join(root, "lib", "pptx.ts"), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2021,
    esModuleInterop: true,
  },
});
await fs.mkdir(runtimeDir, { recursive: true });
await fs.writeFile(path.join(runtimeDir, "pptx.cjs"), transpiled.outputText);
const { buildPptx } = require(path.join(runtimeDir, "pptx.cjs"));

const fixtureNote = "Layout QA fixture only; content is not verified research.";
const deck = {
  title: "University presentation · layout review",
  subtitle: fixtureNote,
  palette: undefined,
  slides: [
    {
      layout: "title",
      heading: "University presentation · layout review",
      subheading: "Offline rendering fixture — SAMPLE content, not verified research",
      bullets: [],
      visual: { type: "none", caption: "", chart: null },
    },
    {
      layout: "content",
      composition: "timeline",
      heading: "Timeline composition · sample labels",
      subheading: "Dates below are synthetic layout markers",
      bullets: [
        "2024 SAMPLE — first review checkpoint",
        "2025 SAMPLE — second review checkpoint",
        "2026 SAMPLE — third review checkpoint",
      ],
      visual: { type: "none", caption: "", chart: null },
    },
    {
      layout: "content",
      composition: "comparison",
      heading: "Comparison composition",
      subheading: "Three neutral fixture categories",
      bullets: [
        "Text-only slide tests line wrapping and hierarchy.",
        "Diagram slide tests local raster placement and caption spacing.",
        "Generated-image slide tests academic preset filtering.",
      ],
      visual: { type: "none", caption: "", chart: null },
    },
    {
      layout: "content",
      composition: "statement",
      heading: "A deliberately long heading for checking wrapping, available width, and spacing around a multi-line academic slide title",
      subheading: "Long-heading layout fixture",
      bullets: [
        "This statement block checks whether a prominent lead remains readable within the content region.",
        "A supporting point below checks separation between the lead and secondary text.",
      ],
      visual: { type: "none", caption: "", chart: null },
    },
    {
      layout: "content",
      composition: "list",
      heading: "Плотный текст на русском языке",
      subheading: "Проверка переноса строк и размера шрифта",
      bullets: [
        "Этот демонстрационный пункт содержит достаточно длинный текст, чтобы проверить переносы, межстрочный интервал и сохранение читаемости в обычной академической композиции.",
        "Второй пункт проверяет, как рядом выглядят несколько абзацев на русском языке при разной длине строк и без использования выдуманных числовых результатов.",
        "Третий пункт описывает только визуальную проверку макета, а не сведения об университете, исследовании или его результатах.",
      ],
      visual: { type: "none", caption: "", chart: null },
    },
    {
      layout: "content",
      composition: "list",
      heading: "Diagram source fixture",
      subheading: "Existing local reference PNG, used only to inspect placement",
      bullets: ["Local diagram-path behavior is included in the academic preview."],
      visual: { type: "none", caption: "Local reference fixture · not research evidence", chart: null },
    },
    {
      layout: "content",
      composition: "list",
      heading: "Photo source fixture",
      subheading: "Local raster stands in for a resolved photo without network access",
      bullets: ["The sourceType metadata checks academic preset handling."],
      visual: { type: "none", caption: "Offline raster fixture tagged as photo · not a factual claim", chart: null },
    },
    {
      layout: "content",
      composition: "list",
      heading: "Generated image source fixture",
      subheading: "The academic preset should omit generated artwork",
      bullets: ["This slide checks filtering behavior, not image generation."],
      visual: { type: "none", caption: "Generated-image fixture · expected to be omitted academically", chart: null },
    },
    {
      layout: "conclusion",
      composition: "statement",
      heading: "End of offline layout review",
      subheading: "All names, dates, and descriptions in this fixture are illustrative.",
      bullets: ["Review the exported slides visually before relying on any production deck."],
      visual: { type: "none", caption: "", chart: null },
    },
  ],
};

const localPng = async (relativePath) => {
  const bytes = await fs.readFile(path.join(root, relativePath));
  return `data:image/png;base64,${bytes.toString("base64")}`;
};
const diagramFixture = await localPng("docs/ex1.png");
const photoPathFixture = await localPng("docs/ex2.png");
const generatedFixture = await localPng("docs/OG_image.png");
const visual = (data, sourceType, alt, caption) => ({
  kind: "image",
  data,
  sourceType,
  alt,
  caption,
});
const aiVisuals = new Map([
  [6, visual(diagramFixture, "diagram", "Local diagram placement fixture", "Diagram placement sample")],
  [7, visual(photoPathFixture, "photo", "Local raster photo-path fixture", "Photo-path sample")],
  [8, visual(generatedFixture, "image", "Generated-image filter fixture", "Generated-image sample")],
]);

await fs.mkdir(outDir, { recursive: true });
for (const preset of ["academic", "business"]) {
  const prefs = preset === "academic" ? { preset: "academic" } : { preset: "auto" };
  const output = path.join(outDir, `quality-preview-${preset}.pptx`);
  await buildPptx(deck, "business", output, undefined, new Map(aiVisuals), prefs);
  console.log(`Wrote ${path.relative(root, output)}`);
}
console.log(fixtureNote);
