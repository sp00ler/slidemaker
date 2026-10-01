import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { inflateSync } from "node:zlib";
import ts from "typescript";

type Visual = {
  type: "none" | "photo" | "image" | "diagram" | "chart";
  search_query: string;
  image_prompt: string;
  mermaid: string;
  chart: { kind: "bar" | "line" | "pie"; unit: string; data: { label: string; value: number }[] } | null;
  caption: string;
  alt: string;
};

type ResolvedVisual =
  | { kind: "image"; data: string; alt: string; caption: string; sourceType?: "photo" | "diagram" | "image" }
  | { kind: "chart"; chart: NonNullable<Visual["chart"]>; alt: string; caption: string };

type VisualsModule = {
  resolveVisual: (visual: Visual, accent?: string) => Promise<ResolvedVisual | null>;
  isAllowedAcademicVisual: (visual: ResolvedVisual) => boolean;
};

const testOutDir = path.join(process.cwd(), ".test-dist");
const requireFromTest = createRequire(__filename);

async function loadVisuals(): Promise<VisualsModule> {
  const runtimeDir = path.join(testOutDir, `runtime-visuals-${Date.now()}-${Math.random()}`);
  const source = await fs.readFile(path.join(process.cwd(), "lib", "visuals.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
  }).outputText;
  const modulePath = path.join(runtimeDir, "lib", "visuals.js");
  await fs.mkdir(path.dirname(modulePath), { recursive: true });
  await fs.writeFile(modulePath, output);
  return requireFromTest(modulePath) as VisualsModule;
}

function visual(type: Visual["type"], fields: Partial<Visual> = {}): Visual {
  return {
    type,
    search_query: "landscape",
    image_prompt: "an editorial illustration",
    mermaid: "graph TD; A-->B",
    chart: null,
    caption: "caption",
    alt: "alt",
    ...fields,
  };
}

test("resolver attaches source provenance to diagram, photo, and generated images", async () => {
  const { resolveVisual } = await loadVisuals();
  const originalFetch = globalThis.fetch;
  const oldPexelsKey = process.env.PEXELS_API_KEY;
  const oldOpenAiKey = process.env.OPENAI_API_KEY;
  process.env.PEXELS_API_KEY = "test";
  process.env.OPENAI_API_KEY = "test";
  let fetchCount = 0;
  const diagramBodies: string[] = [];
  globalThis.fetch = async (_url, init) => {
    fetchCount += 1;
    if (fetchCount === 1 || fetchCount === 2 || fetchCount === 4) {
      if (fetchCount <= 2) diagramBodies.push(String(init?.body ?? ""));
      return new Response(new Uint8Array([1, 2, 3]));
    }
    if (fetchCount === 3) {
      return Response.json({ photos: [{ src: { large: "https://example.test/photo.jpg" } }] });
    }
    return Response.json({ data: [{ b64_json: "aW1hZ2U=" }] });
  };

  try {
    const diagram = await resolveVisual(visual("diagram"), "#336699");
    const fallbackDiagram = await resolveVisual(visual("diagram"), "not-a-hex-color");
    const photo = await resolveVisual(visual("photo"));
    const generated = await resolveVisual(visual("image"));
    assert.ok(diagram?.kind === "image");
    assert.ok(fallbackDiagram?.kind === "image");
    assert.ok(photo?.kind === "image");
    assert.ok(generated?.kind === "image");
    assert.equal(diagram.sourceType, "diagram");
    assert.equal(photo.sourceType, "photo");
    assert.equal(generated.sourceType, "image");
    assert.match(diagramBodies[0], /^%%\{init: /);
    assert.match(diagramBodies[0], /"theme":"base"/);
    assert.match(diagramBodies[0], /"primaryColor":"#F7F8FA"/);
    assert.match(diagramBodies[0], /"primaryBorderColor":"#336699"/);
    assert.match(diagramBodies[0], /"primaryTextColor":"#1A1A1A"/);
    assert.match(diagramBodies[0], /"lineColor":"#336699"/);
    assert.match(diagramBodies[0], /"fontFamily":"Arial"/);
    assert.match(diagramBodies[0], /"fontSize":"22px"/);
    assert.match(diagramBodies[0], /graph TD; A-->B$/);
    assert.match(diagramBodies[1], /"primaryBorderColor":"#1F3A5F"/);
    assert.match(diagramBodies[1], /"lineColor":"#1F3A5F"/);
    assert.doesNotMatch(diagramBodies[1], /not-a-hex-color/);
    assert.equal(fetchCount, 5);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldPexelsKey === undefined) delete process.env.PEXELS_API_KEY;
    else process.env.PEXELS_API_KEY = oldPexelsKey;
    if (oldOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAiKey;
  }
});

test("diagram falls back to Mermaid Ink after Kroki transport failure", async () => {
  const { resolveVisual } = await loadVisuals();
  const originalFetch = globalThis.fetch;
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.startsWith("https://kroki.io/")) throw new Error("Kroki fetch failed");
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } });
  };

  try {
    const source = visual("diagram", { mermaid: "graph LR\n A-->B" });
    const resolved = await resolveVisual(source, "#336699");
    assert.ok(resolved?.kind === "image");
    assert.equal(resolved.sourceType, "diagram");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].init?.method, "POST");

    const fallbackUrl = new URL(requests[1].url);
    assert.equal(fallbackUrl.pathname.startsWith("/img/pako:"), true);
    assert.equal(fallbackUrl.searchParams.get("type"), "png");
    const encoded = fallbackUrl.pathname.slice("/img/pako:".length);
    const payload = JSON.parse(inflateSync(Buffer.from(encoded, "base64url")).toString("utf8"));
    assert.equal(payload.mermaid.theme, "base");
    assert.match(payload.code, /^%%\{init: /);
    assert.match(payload.code, /"primaryBorderColor":"#336699"/);
    assert.match(payload.code, /graph LR\n A-->B$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("diagram returns missing visual when Kroki and Mermaid Ink both fail", async () => {
  const { resolveVisual } = await loadVisuals();
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.startsWith("https://kroki.io/")) return new Response(null, { status: 503 });
    throw new Error("Mermaid Ink fetch failed");
  };

  try {
    assert.equal(await resolveVisual(visual("diagram")), null);
    assert.equal(urls.length, 2);
    assert.ok(urls[0].startsWith("https://kroki.io/mermaid/png"));
    assert.ok(urls[1].startsWith("https://mermaid.ink/img/pako:"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("academic visual filter rejects generated images but allows other and legacy visuals", async () => {
  const { isAllowedAcademicVisual } = await loadVisuals();
  const image = (sourceType?: "photo" | "diagram" | "image"): ResolvedVisual => ({
    kind: "image",
    data: "data:image/png;base64,AA==",
    alt: "alt",
    caption: "caption",
    ...(sourceType ? { sourceType } : {}),
  });
  assert.equal(isAllowedAcademicVisual(image("image")), false);
  assert.equal(isAllowedAcademicVisual(image("photo")), true);
  assert.equal(isAllowedAcademicVisual(image("diagram")), true);
  assert.equal(isAllowedAcademicVisual(image()), true);
  assert.equal(
    isAllowedAcademicVisual({
      kind: "chart",
      chart: { kind: "bar", unit: "", data: [{ label: "A", value: 1 }] },
      alt: "chart",
      caption: "caption",
    }),
    true
  );
});
