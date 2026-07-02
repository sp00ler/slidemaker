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
      slides: Array<{
        layout: "title" | "content" | "section" | "conclusion";
        heading: string;
        subheading: string;
        bullets: string[];
      }>;
    },
    style: string,
    outPath: string,
    slideImages?: Map<number, { path: string; description: string | null }>,
    aiVisuals?: Map<
      number,
      { kind: "image"; data: string; alt: string; caption: string }
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

const testOutDir = path.join(process.cwd(), ".test-dist");
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

test("buildPptx rotates content layouts so neighbors differ", async () => {
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
  // decor-фигура каждого варианта уникальна по геометрии — сериализуем и сравниваем
  const decor = slides.map((s) => JSON.stringify(s.shapes[0]));
  assert.notEqual(decor[0], decor[1], "slide 0 and 1 share layout");
  assert.notEqual(decor[1], decor[2], "slide 1 and 2 share layout");
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
