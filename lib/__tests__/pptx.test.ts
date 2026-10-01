import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

type PptxModule = {
  buildPptx: (
    deck: {
      title: string;
      subtitle: string;
      palette?: { bg?: string; ink?: string; accent?: string };
      slides: Array<{
        layout: "title" | "content" | "section" | "conclusion";
        heading: string;
        subheading: string;
        bullets: string[];
        composition?: string;
        sources?: string[];
      }>;
    },
    style: string,
    outPath: string,
    slideImages?: Map<number, { path: string; description: string | null }>,
    aiVisuals?: Map<
      number,
      { kind: "image"; data: string; alt: string; caption: string; sourceType?: "photo" | "diagram" | "image" }
    >,
    prefs?: {
      preset?: "academic" | "auto" | "custom";
      title?: { mode?: "auto" | "self" | "upload"; fileId?: string };
      fonts?: {
        heading?: { face?: string; size?: number; bold?: boolean; italic?: boolean };
        body?: { face?: string; size?: number };
      };
      palette?: { bg?: string; text?: string; accent?: string };
    },
    titleImage?: { path: string; description: string | null }
  ) => Promise<void>;
};

// Минимальный валидный PNG-заголовок с заданными размерами (IHDR width/height).
function pngHeader(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); // длина IHDR
  ihdr.write("IHDR", 4, "ascii");
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  return Buffer.concat([sig, ihdr]);
}

const testOutDir = process.env.PPTX_TEST_OUT_DIR
  ? path.resolve(process.env.PPTX_TEST_OUT_DIR)
  : path.join(process.cwd(), ".test-dist");
const requireFromTest = createRequire(__filename);
const runtimeDir = path.join(testOutDir, `runtime-pptx-${Date.now()}-${Math.random()}`);

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

async function loadPptx(): Promise<{
  mod: PptxModule;
  capture: { fileName: string; slides: unknown[] };
}> {
  await fs.mkdir(path.join(runtimeDir, "node_modules", "pptxgenjs"), { recursive: true });
  await fs.writeFile(
    path.join(runtimeDir, "node_modules", "pptxgenjs", "index.js"),
    `module.exports = class PptxGenJS {
      constructor() {
        this.slides = [];
      }
      addSlide() {
        const slide = {
          background: null,
          texts: [],
          shapes: [],
          images: [],
          addText: (...args) => slide.texts.push(args),
          addShape: (...args) => slide.shapes.push(args),
          addImage: (...args) => slide.images.push(args),
        };
        this.slides.push(slide);
        return slide;
      }
      async writeFile({ fileName }) {
        global.__pptxCapture.fileName = fileName;
        global.__pptxCapture.slides = this.slides;
      }
    };`
  );

  const capture = { fileName: "", slides: [] as unknown[] };
  (globalThis as unknown as { __pptxCapture: typeof capture }).__pptxCapture = capture;

  const outPath = path.join(runtimeDir, "lib", "pptx.js");
  await transpileSource(path.join(process.cwd(), "lib", "pptx.ts"), outPath);
  delete require.cache[outPath];

  return { mod: requireFromTest(outPath), capture };
}

test("buildPptx inserts uploaded image on matching content slide", async () => {
  const { mod, capture } = await loadPptx();
  const uploadPath = path.join(process.cwd(), "uploads", `pptx-test-${Date.now()}.png`);
  await fs.mkdir(path.dirname(uploadPath), { recursive: true });
  await fs.writeFile(
    uploadPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9Y1XkAAAAASUVORK5CYII=",
      "base64"
    )
  );

  try {
    await mod.buildPptx(
      {
        title: "Deck",
        subtitle: "",
        slides: [
          { layout: "title", heading: "Title", subheading: "", bullets: [] },
          { layout: "content", heading: "Body", subheading: "", bullets: ["Point"] },
          { layout: "conclusion", heading: "End", subheading: "", bullets: [] },
        ],
      },
      "business",
      path.join(runtimeDir, "out.pptx"),
      new Map([
        [
          2,
          {
            path: path.relative(process.cwd(), uploadPath),
            description: "Скрин",
          },
        ],
      ])
    );
  } finally {
    await fs.rm(uploadPath, { force: true });
    await fs.rm(runtimeDir, { recursive: true, force: true });
  }

  assert.equal(capture.fileName, path.join(runtimeDir, "out.pptx"));
  const slides = capture.slides as Array<{ images: unknown[]; texts: unknown[][] }>;
  assert.equal(slides[0].images.length, 0);
  assert.equal(slides[1].images.length, 1);
  assert.equal(slides[2].images.length, 0);

  const imageArgs = slides[1].images[0] as [{ path: string }];
  assert.equal(imageArgs[0].path, uploadPath);
  const captionArgs = slides[1].texts.find((args) => args[0] === "Скрин");
  assert.ok(captionArgs, "caption text missing");
});

test("buildPptx fit-contains AI image preserving aspect ratio", async () => {
  const { mod, capture } = await loadPptx();
  // вертикальная картинка 100x200 → аспект 0.5
  const data = `data:image/png;base64,${pngHeader(100, 200).toString("base64")}`;

  await mod.buildPptx(
    {
      title: "Deck",
      subtitle: "",
      slides: [
        { layout: "content", heading: "Body", subheading: "", bullets: ["Point"] },
      ],
    },
    "business",
    path.join(runtimeDir, "out.pptx"),
    undefined,
    new Map([[1, { kind: "image", data, alt: "a", caption: "c" }]])
  );
  await fs.rm(runtimeDir, { recursive: true, force: true });

  const slides = capture.slides as Array<{ images: unknown[] }>;
  const imgArgs = slides[0].images[0] as [{ w: number; h: number; x: number; y: number }];
  const { w, h } = imgArgs[0];
  // регион с буллетами: 5.2 x 3.45 → узкая картинка вписана по высоте
  assert.ok(Math.abs(w / h - 0.5) < 0.01, `aspect distorted: ${w}x${h}`);
  assert.ok(h <= 3.45 + 1e-6 && w <= 5.2 + 1e-6, "image exceeds region");
});

test("buildPptx keeps one consistent decor across the whole deck", async () => {
  const { mod, capture } = await loadPptx();
  const content = (heading: string) => ({
    layout: "content" as const,
    heading,
    subheading: "",
    bullets: ["p"],
  });

  await mod.buildPptx(
    {
      title: "Deck",
      subtitle: "",
      slides: [content("A"), content("B"), content("C")],
    },
    "business",
    path.join(runtimeDir, "out.pptx")
  );
  await fs.rm(runtimeDir, { recursive: true, force: true });

  const slides = capture.slides as Array<{ shapes: unknown[][] }>;
  // один декор на всю колоду — рандомные полосы читались как хаос
  const decor = slides.map((s) => JSON.stringify(s.shapes[0]));
  assert.equal(decor[0], decor[1], "slide 0 and 1 decor must match");
  assert.equal(decor[1], decor[2], "slide 1 and 2 decor must match");
});

// Собрать все fontFace из addText-вызовов слайда.
function collectFaces(slide: { texts: unknown[][] }): string[] {
  const faces: string[] = [];
  for (const args of slide.texts) {
    const opts = args[1] as { fontFace?: string } | undefined;
    if (opts?.fontFace) faces.push(opts.fontFace);
  }
  return faces;
}

test("buildPptx prefs override fontFace from whitelist", async () => {
  const { mod, capture } = await loadPptx();

  await mod.buildPptx(
    {
      title: "Deck",
      subtitle: "",
      slides: [
        { layout: "title", heading: "T", subheading: "sub", bullets: [] },
        { layout: "content", heading: "Body", subheading: "", bullets: ["one", "two"] },
      ],
    },
    "business",
    path.join(runtimeDir, "out.pptx"),
    undefined,
    undefined,
    {
      fonts: {
        heading: { face: "Times New Roman" },
        body: { face: "Tahoma" },
      },
    }
  );
  await fs.rm(runtimeDir, { recursive: true, force: true });

  const slides = capture.slides as Array<{ texts: unknown[][] }>;
  const faces = slides.flatMap(collectFaces);
  assert.ok(faces.includes("Times New Roman"), "heading font not applied");
  assert.ok(faces.includes("Tahoma"), "body font not applied");
  assert.ok(!faces.includes("Calibri"), "base preset font leaked through");
});

test("buildPptx academic preset uses no colored background", async () => {
  const { mod, capture } = await loadPptx();

  await mod.buildPptx(
    {
      title: "Deck",
      subtitle: "",
      slides: [
        { layout: "title", heading: "T", subheading: "s", bullets: [] },
        { layout: "section", heading: "Sec", subheading: "", bullets: [] },
        { layout: "content", heading: "Body", subheading: "", bullets: ["a", "b", "c"] },
      ],
    },
    "business",
    path.join(runtimeDir, "out.pptx"),
    undefined,
    undefined,
    { preset: "academic" }
  );
  await fs.rm(runtimeDir, { recursive: true, force: true });

  const slides = capture.slides as Array<{ background: { color?: string } | null }>;
  for (const s of slides) {
    assert.equal(s.background?.color, "FFFFFF", "academic slide not white");
  }
});

test("buildPptx title mode self omits generated title slide", async () => {
  const { mod, capture } = await loadPptx();

  await mod.buildPptx(
    {
      title: "Deck",
      subtitle: "",
      slides: [
        { layout: "title", heading: "T", subheading: "", bullets: [] },
        { layout: "content", heading: "Body", subheading: "", bullets: ["x"] },
        { layout: "conclusion", heading: "End", subheading: "", bullets: [] },
      ],
    },
    "business",
    path.join(runtimeDir, "out.pptx"),
    undefined,
    undefined,
    { title: { mode: "self" } }
  );
  await fs.rm(runtimeDir, { recursive: true, force: true });

  // 3 слайда в колоде, но title пропущен → 2 отрендерено.
  assert.equal(capture.slides.length, 2, "title slide was not omitted");
});

test("buildPptx places wide visual bottom full-width and shrinks bullets font", async () => {
  const { mod, capture } = await loadPptx();
  // широкая диаграмма 1200x300 (аспект 4) → нижний регион на всю ширину
  const data = `data:image/png;base64,${pngHeader(1200, 300).toString("base64")}`;
  const longBullets = [
    "Очень длинный пункт с большим количеством слов который занимает несколько строк текста подряд",
    "Второй длинный пункт с большим количеством слов который тоже занимает несколько строк",
    "Третий пункт с заметным объёмом текста для проверки уменьшения кегля",
    "Четвёртый пункт с заметным объёмом текста для проверки уменьшения кегля",
    "Пятый пункт с заметным объёмом текста для проверки уменьшения кегля",
  ];

  await mod.buildPptx(
    {
      title: "Deck",
      subtitle: "",
      slides: [
        { layout: "content", heading: "Body", subheading: "", bullets: longBullets },
      ],
    },
    "business",
    path.join(runtimeDir, "out.pptx"),
    undefined,
    new Map([[1, { kind: "image", data, alt: "a", caption: "c" }]])
  );
  await fs.rm(runtimeDir, { recursive: true, force: true });

  const slides = capture.slides as Array<{ images: unknown[][]; texts: unknown[][] }>;
  const imgOpts = (slides[0].images[0] as [{ x: number; y: number; w: number; h: number }])[0];
  // нижний регион: y >= 4.0 (полоса поднята и увеличена), ширина почти вся
  assert.ok(imgOpts.y >= 4.0, `wide visual not at bottom: y=${imgOpts.y}`);
  assert.ok(imgOpts.w > 8, `wide visual not full-width: w=${imgOpts.w}`);

  // буллеты ужаты: кегль меньше базовых 18pt
  const bodyCalls = slides[0].texts.filter(args => longBullets.includes(args[0] as string));
  assert.equal(bodyCalls.length, longBullets.length, "all text must survive layout");
  for (const args of bodyCalls) {
    const box = args[1] as { fontSize: number; y: number; h: number };
    assert.ok(box.fontSize < 18, "body font must shrink to fit");
    assert.ok(box.y + box.h <= 4.0, "body must remain above image");
  }
});

test("academic content with wide visual keeps text above the bottom band", async () => {
  const { mod, capture } = await loadPptx();
  // Academic дропает AI-image (кириллица) — широкий визуал только из ЗАГРУЖЕННОГО
  // изображения. Пишем PNG 1200x300 (аспект 4) под uploads/, отдаём через slideImages.
  const uploadDir = path.join(process.cwd(), "uploads", `t44-${Date.now()}`);
  await fs.mkdir(uploadDir, { recursive: true });
  const uploadPath = path.join(uploadDir, "wide.png");
  await fs.writeFile(uploadPath, pngHeader(1200, 300));
  const relPath = path.relative(process.cwd(), uploadPath);

  await mod.buildPptx(
    {
      title: "Deck",
      subtitle: "",
      slides: [
        {
          layout: "content",
          heading: "Этапы исследования",
          subheading: "",
          bullets: ["Этап 1: анализ", "Этап 2: классификация", "Этап 3: характеристика", "Этап 4: выводы"],
        },
      ],
    },
    "business",
    path.join(runtimeDir, "out.pptx"),
    new Map([[1, { path: relPath, description: "c" }]]),
    undefined,
    { preset: "academic" }
  );
  await fs.rm(runtimeDir, { recursive: true, force: true });
  await fs.rm(uploadDir, { recursive: true, force: true });

  const slides = capture.slides as Array<{
    images: unknown[][];
    texts: unknown[][];
  }>;
  const imgOpts = (slides[0].images[0] as [{ y: number; w: number }])[0];
  assert.ok(imgOpts.y >= 4.0, `wide visual not at bottom: y=${imgOpts.y}`);

  // все текстовые блоки буллетов (кроме watermark и caption) выше нижнего региона (y=4.05)
  for (const args of slides[0].texts) {
    const [content, opts] = args as [unknown, { y?: number; h?: number; fontSize?: number }];
    if (typeof content === "string" && content === "slidemaker.ru") continue;
    if (typeof content === "string" && content === "c") continue; // caption
    if (typeof opts?.y !== "number" || typeof opts?.h !== "number") continue;
    assert.ok(
      opts.y + opts.h <= 4.05 + 1e-6,
      `text block overlaps bottom visual: y=${opts.y} h=${opts.h} (${String(content).slice(0, 30)})`
    );
  }
});

test("academic numbered bullets all share one font size", async () => {
  const { mod, capture } = await loadPptx();
  // Тезисы резко разной длины — раньше каждый вписывался отдельно и получал свой
  // кегль (жалоба Юленьки «каждый тезис разного размера»). Теперь — единый.
  const bullets = [
    "Кратко",
    "Средний по длине тезис из нескольких слов подряд",
    "Очень длинный тезис занимающий заметный объём и несколько строк текста для проверки",
  ];

  await mod.buildPptx(
    {
      title: "Deck",
      subtitle: "",
      slides: [{ layout: "content", heading: "Итоги", subheading: "", bullets }],
    },
    "business",
    path.join(runtimeDir, "out.pptx"),
    undefined,
    undefined,
    { preset: "academic" }
  );
  await fs.rm(runtimeDir, { recursive: true, force: true });

  const slides = capture.slides as Array<{ texts: unknown[][] }>;
  const sizes = slides[0].texts
    .filter((args) => bullets.includes(args[0] as string))
    .map((args) => (args[1] as { fontSize: number }).fontSize);
  assert.equal(sizes.length, bullets.length, "not all bullets rendered");
  assert.ok(
    sizes.every((s) => s === sizes[0]),
    `bullet font sizes not uniform: ${sizes.join(",")}`
  );
});

test("academic renderer preserves photos and diagrams but excludes generated artwork", async () => {
  const { mod, capture } = await loadPptx();
  const data = `data:image/png;base64,${pngHeader(400, 400).toString("base64")}`;
  const kinds = ["photo", "diagram", "image"] as const;
  await mod.buildPptx({ title: "Assets", subtitle: "", slides: kinds.map(kind => ({
    layout: "content" as const, heading: kind, subheading: "", bullets: ["A meaningful point"]
  })) }, "business", path.join(runtimeDir, "out.pptx"), undefined,
  new Map(kinds.map((sourceType, i) => [i + 1, { kind: "image" as const, data, alt: sourceType, caption: "", sourceType }])),
  { preset: "academic" });
  const slides = capture.slides as Array<{ images: unknown[] }>;
  assert.deepEqual(slides.map(s => s.images.length), [1, 1, 0]);
  await fs.rm(runtimeDir, { recursive: true, force: true });
});

test("timeline preserves dates and descriptions without slide-index layout rotation", async () => {
  const { mod, capture } = await loadPptx();
  const content = { layout: "content" as const, composition: "timeline", heading: "History", subheading: "",
    bullets: ["2004 Independent institution", "2024 New research programme"] };
  await mod.buildPptx({ title: "History", subtitle: "", slides: [content, content] }, "business", path.join(runtimeDir, "out.pptx"), undefined, undefined, { preset: "academic" });
  const slides = capture.slides as Array<{ texts: unknown[][]; shapes: unknown[][] }>;
  assert.deepEqual(slides[0].shapes, slides[1].shapes);
  for (const text of ["2004", "2024", "Independent institution", "New research programme"])
    assert.ok(slides[0].texts.some(args => args[0] === text), `Missing timeline content: ${text}`);
  for (const args of slides[0].texts) {
    const box = args[1] as { x: number; y: number; w: number; h: number };
    assert.ok(box.x >= 0.5 && box.x + box.w <= 12.84);
    assert.ok(box.y >= 0.5 && box.y + box.h <= 7.01);
  }
  await fs.rm(runtimeDir, { recursive: true, force: true });
});


test("bare year bullets fall back safely without crashing timeline rendering", async () => {
  const { mod, capture } = await loadPptx();
  await mod.buildPptx({ title: "Dates", subtitle: "", slides: [{ layout: "content", composition: "timeline",
    heading: "Dates", subheading: "", bullets: ["2020", "2021"] }] }, "business", path.join(runtimeDir, "out.pptx"));
  const slide = capture.slides[0] as { texts: unknown[][] };
  assert.ok(slide.texts.some(args => args[0] === "2020"));
  assert.ok(slide.texts.some(args => args[0] === "2021"));
  await fs.rm(runtimeDir, { recursive: true, force: true });
});


test("automatic palette reaches renderer while academic and custom choices win", async () => {
  const { mod, capture } = await loadPptx();
  const deck = { title: "Colors", subtitle: "", palette: { bg: "F4F0EA", ink: "312A26", accent: "8C4235" },
    slides: [{ layout: "content" as const, heading: "Colors", subheading: "", bullets: ["A point"] }] };
  await mod.buildPptx(deck, "business", path.join(runtimeDir, "out.pptx"), undefined, undefined, { preset: "auto" });
  assert.equal((capture.slides[0] as { background: { color: string } }).background.color, "F4F0EA");
  await mod.buildPptx(deck, "business", path.join(runtimeDir, "out.pptx"), undefined, undefined, { preset: "academic" });
  assert.equal((capture.slides[0] as { background: { color: string } }).background.color, "FFFFFF");
  await mod.buildPptx(deck, "business", path.join(runtimeDir, "out.pptx"), undefined, undefined, { preset: "custom", palette: { bg: "EEEEEE" } });
  assert.equal((capture.slides[0] as { background: { color: string } }).background.color, "EEEEEE");
  await fs.rm(runtimeDir, { recursive: true, force: true });
});

test("comparison cards split short labels, preserve text, and fit content-sized boxes", async () => {
  const { mod, capture } = await loadPptx();
  const bullets = [
    "Evidence base: Uses only the operator-provided source notes.",
    "Research themes — Connects basic, translational, and clinical research.",
    "A fallback card remains intact without a label delimiter.",
  ];
  await mod.buildPptx({ title: "Comparison", subtitle: "", slides: [{
    layout: "content", composition: "comparison", heading: "Comparison", subheading: "", bullets,
  }] }, "business", path.join(runtimeDir, "out.pptx"), undefined, undefined, { preset: "academic" });

  const slide = capture.slides[0] as {
    texts: Array<[string, { x: number; y: number; w: number; h: number; bold?: boolean }]>
  };
  const text = slide.texts.map(([value]) => value);
  for (const value of [
    "Evidence base",
    "Uses only the operator-provided source notes.",
    "Research themes",
    "Connects basic, translational, and clinical research.",
    bullets[2],
  ]) assert.ok(text.includes(value), `Missing comparison text: ${value}`);

  const labelBoxes = slide.texts.filter(([value]) => ["Evidence base", "Research themes"].includes(value));
  assert.equal(labelBoxes.length, 2);
  for (const [, box] of labelBoxes) assert.equal(box.bold, true);

  for (let i = 0; i < slide.texts.length; i++) {
    const a = slide.texts[i][1];
    for (let j = i + 1; j < slide.texts.length; j++) {
      const b = slide.texts[j][1];
      const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlaps, false, `Text boxes overlap: ${slide.texts[i][0]} / ${slide.texts[j][0]}`);
    }
  }

  const cardShapes = (capture.slides[0] as { shapes: Array<[string, { x: number; y: number; w: number; h: number }]> }).shapes
    .filter(([kind]) => kind === "rect");
  assert.equal(cardShapes.length, 3);
  assert.ok(cardShapes.every(([, box]) => box.h < 3), `short comparison cards should stay content-sized: ${cardShapes.map(([, box]) => box.h).join(",")}`);
  await fs.rm(runtimeDir, { recursive: true, force: true });
});

test("content sources render as safe clickable footers below visual captions", async () => {
  const { mod, capture } = await loadPptx();
  const data = `data:image/png;base64,${pngHeader(1200, 300).toString("base64")}`;
  const sourceUrl = "https://www.meduniwien.ac.at/web/en/research/areas-of-research/";
  await mod.buildPptx({ title: "Sources", subtitle: "", slides: [{
    layout: "content", heading: "Research overview", subheading: "", bullets: ["A sourced fixture point"],
    sources: [sourceUrl, "javascript:alert(1)"],
  }] }, "business", path.join(runtimeDir, "out.pptx"), undefined,
  new Map([[1, { kind: "image", data, alt: "Diagram", caption: "Diagram caption", sourceType: "diagram" }]]),
  { preset: "academic" });

  const slide = capture.slides[0] as {
    texts: Array<[string | Array<{ text: string; options?: { hyperlink?: { url: string } } }>, { x: number; y: number; w: number; h: number }]>
  };
  const sourceRun = slide.texts.flatMap(([value]) => Array.isArray(value) ? value : [])
    .find(run => run.options?.hyperlink?.url === sourceUrl);
  assert.ok(sourceRun, "HTTPS source should be clickable using its full URL");
  assert.equal(sourceRun.text, "meduniwien.ac.at · 1");
  assert.ok(!slide.texts.flatMap(([value]) => Array.isArray(value) ? value : []).some(run => run.text.includes("alert(1)")));

  const sourceBox = slide.texts.find(([value]) => Array.isArray(value))?.[1];
  const captionBox = slide.texts.find(([value]) => value === "Diagram caption")?.[1];
  assert.ok(sourceBox && captionBox, "source footer and diagram caption should both render");
  assert.ok(captionBox.y + captionBox.h <= sourceBox.y, "footer should not overlap the visual caption");
  assert.ok(sourceBox.y >= 7.0 && sourceBox.y + sourceBox.h <= 7.5, "source footer should sit at slide bottom");
  await fs.rm(runtimeDir, { recursive: true, force: true });
});
