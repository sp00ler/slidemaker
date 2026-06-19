import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

type Slide = {
  layout: "title" | "content" | "section" | "conclusion";
  heading: string;
  subheading: string;
  bullets: string[];
};

type Deck = {
  title: string;
  subtitle: string;
  slides: Slide[];
};

type AnthropicModule = {
  extractJson: (text: string) => string;
  normalizeDeck: (deck: Deck, slideCount: number) => Deck;
};

process.env.ANTHROPIC_API_KEY = "test-dummy";

const testOutDir = path.join(process.cwd(), ".test-dist");
const runtimeOutDir = path.join(testOutDir, "runtime");
const requireFromTest = createRequire(__filename);
const moduleWithResolver = Module as typeof Module & {
  _resolveFilename: (
    request: string,
    parent: unknown,
    isMain: boolean,
    options?: unknown
  ) => string;
};
const originalResolveFilename = moduleWithResolver._resolveFilename;

moduleWithResolver._resolveFilename = function (
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
  options?: unknown
): string {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(runtimeOutDir, request.slice(2)),
      parent,
      isMain,
      options
    );
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

async function transpileSource(srcPath: string, outPath: string): Promise<void> {
  const source = await fs.readFile(srcPath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
  }).outputText;

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, output);
}

async function loadAnthropic(): Promise<AnthropicModule> {
  await transpileSource(
    path.join(process.cwd(), "lib", "tariffs.ts"),
    path.join(runtimeOutDir, "lib", "tariffs.js")
  );
  await transpileSource(
    path.join(process.cwd(), "lib", "anthropic.ts"),
    path.join(runtimeOutDir, "lib", "anthropic.js")
  );

  return requireFromTest(path.join(runtimeOutDir, "lib", "anthropic.js"));
}

function slide(layout: Slide["layout"], heading: string): Slide {
  return {
    layout,
    heading,
    subheading: "",
    bullets: layout === "title" ? [] : ["Пункт"],
  };
}

function deck(slides: Slide[]): Deck {
  return {
    title: "Тестовая презентация",
    subtitle: "Подзаголовок",
    slides,
  };
}

test("extractJson removes json fences", async () => {
  const { extractJson } = await loadAnthropic();

  assert.equal(extractJson('```json\n{"ok":true}\n```'), '{"ok":true}');
});

test("extractJson cuts prefix and suffix around json object", async () => {
  const { extractJson } = await loadAnthropic();

  assert.equal(extractJson('prefix {"ok":true} suffix'), '{"ok":true}');
});

test("extractJson returns trimmed input without wrappers", async () => {
  const { extractJson } = await loadAnthropic();

  assert.equal(extractJson('  {"ok":true}  '), '{"ok":true}');
});

test("normalizeDeck pads undershoot to exact slide count", async () => {
  const { normalizeDeck } = await loadAnthropic();
  const normalized = normalizeDeck(
    deck([
      slide("title", "Title"),
      slide("content", "One"),
      slide("conclusion", "Conclusion"),
    ]),
    5
  );

  assert.equal(normalized.slides.length, 5);
  assert.equal(normalized.slides[0].layout, "title");
  assert.equal(normalized.slides.at(-1)?.layout, "conclusion");
});

test("normalizeDeck trims overshoot without dropping conclusion", async () => {
  const { normalizeDeck } = await loadAnthropic();
  const normalized = normalizeDeck(
    deck([
      slide("title", "Title"),
      slide("content", "One"),
      slide("content", "Two"),
      slide("content", "Three"),
      slide("content", "Four"),
      slide("conclusion", "Conclusion"),
    ]),
    4
  );

  assert.equal(normalized.slides.length, 4);
  assert.equal(normalized.slides[0].layout, "title");
  assert.equal(normalized.slides.at(-1)?.layout, "conclusion");
  assert.equal(normalized.slides.at(-1)?.heading, "Conclusion");
});
