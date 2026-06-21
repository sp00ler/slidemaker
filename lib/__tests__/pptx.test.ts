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
    slideImages?: Map<number, { path: string; description: string | null }>
  ) => Promise<void>;
};

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
