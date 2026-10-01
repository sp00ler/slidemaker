import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "tmp", "quality-live");
const runtimeDir = path.join(outputDir, "runtime");
const ts = require("typescript");

// Load the project's local environment before Anthropic's client is created.
require("@next/env").loadEnvConfig(root);

const modules = ["tariffs", "deck-quality", "anthropic", "visuals", "pptx"];
await fs.mkdir(runtimeDir, { recursive: true });
for (const name of modules) {
  const source = await fs.readFile(path.join(root, "lib", `${name}.ts`), "utf8");
  let output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
    },
  }).outputText;
  output = output.replaceAll('require("@/lib/tariffs")', 'require("./tariffs.cjs")');
  output = output.replaceAll('require("@/lib/deck-quality")', 'require("./deck-quality.cjs")');
  await fs.writeFile(path.join(runtimeDir, `${name}.cjs`), output);
}

const { generateDeck } = require(path.join(runtimeDir, "anthropic.cjs"));
const { resolveDeckVisuals } = require(path.join(runtimeDir, "visuals.cjs"));
const { buildPptx } = require(path.join(runtimeDir, "pptx.cjs"));

const fallbackSourceText = [
  "SYNTHETIC FIXTURE: every institution, date, program, project, partnership, and statement below is fictional educational material created only for a generation smoke test.",
  "Institution: Example Institute for Learning Systems, a fictional teaching institution. Topic: how learning systems are studied and taught.",
  "Synthetic timeline: 2018 — the fictional institute is imagined as a small teaching lab; 2019 — it adds a learning-design seminar; 2020 — it begins a fictional open-data methods course; 2021 — it pilots a classroom observation practicum; 2022 — it creates a student research studio; 2023 — it starts a teaching partnership with the fictional Example Community Lab; 2024 — it publishes a fictional teaching toolkit; 2025 — it reviews the toolkit in a cross-disciplinary workshop.",
  "Research theme: one fictional research question is how the timing of instructor feedback shapes a learner's revision process. A fictional methods exercise compares anonymised draft versions and records when feedback was given; it supplies no findings or claimed outcome.",
  "Education: the fictional curriculum includes a learning-design seminar, an open-data methods course, and a classroom observation practicum. Describe these as teaching activities, without inventing credits, enrollment, or outcomes.",
  "Practicum sequence (exactly these three steps, in this order): 1. Observe a lesson. 2. Record anonymised observations about feedback timing and revision opportunities. 3. Discuss the limitations of those observations. Do not add stages, reverse the sequence, report real classroom observations, or imply that the exercise establishes an effect.",
  "Student research studio: learners choose a question, collect a fictional sample, analyse it, and present it for peer review. Keep the sample and any analysis explicitly instructional and fictional; state no numerical results.",
  "Partnership and knowledge-sharing: the fictional Example Community Lab co-designs a teaching toolkit with the institute. A cross-disciplinary workshop discusses the toolkit's limitations and possible classroom uses; do not claim adoption or impact.",
  "Together with the fictional institutional timeline, these are six distinct substantive aspects: development, research question and method, curriculum, practicum, research-studio workflow, and partnership/toolkit review.",
  "Use the timeline and details only as synthetic scenario material. Do not present any of them as real-world facts about an actual university. Avoid unsupported statistics, rankings, outcomes, real people, or citations.",
  "Label the presentation ‘Synthetic fixture’ so the fictional status remains clear. Do not add URLs or source footers to this fixture.",
].join("\n");
const sourceFile = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : undefined;
const sourceText = sourceFile ? await fs.readFile(sourceFile, "utf8") : fallbackSourceText;
const topic = sourceFile ? "Medical University of Vienna" : "Example Institute for Learning Systems (synthetic fixture)";

const timeout = setTimeout(() => {
  console.error("Generation quality smoke timed out after 180 seconds.");
  process.exit(1);
}, 180_000);

let stage = "runtime setup";
const pexelsKey = process.env.PEXELS_API_KEY;
const openAiKey = process.env.OPENAI_API_KEY;
delete process.env.PEXELS_API_KEY;
delete process.env.OPENAI_API_KEY;
try {
  await fs.mkdir(outputDir, { recursive: true });
  stage = "Anthropic deck generation";
  const deck = await generateDeck({
    topic,
    style: "business",
    slideCount: 8,
    sourceText,
    wishes: "English language. Academic preset. Use a restrained academic structure and avoid unsupported claims.",
    design: { preset: "academic", workType: "generic" },
  });

  await fs.writeFile(
    path.join(outputDir, "deck.json"),
    `${JSON.stringify({ fixture: !sourceFile, sourceText, deck }, null, 2)}\n`,
    "utf8"
  );

  // Keep generation and resolution aligned: optional photo/art services stay
  // disabled for the whole smoke. Mermaid resolution retains its existing path.
  stage = "visual resolution";
  const visuals = await resolveDeckVisuals(deck);

  const academic = true;
  const plannedVisualSlides = deck.slides.flatMap((slide, index) => {
    if (slide.layout !== "content") return [];
    const generatedImage = slide.visual.type === "image";
    const requestedVisual =
      slide.visual.type === "photo" ||
      slide.visual.type === "diagram" ||
      slide.visual.type === "chart" ||
      (generatedImage && !academic);
    return requestedVisual ? [index + 1] : [];
  });
  const missingVisualSlides = plannedVisualSlides.filter((slideNumber) => {
    const visual = visuals.get(slideNumber);
    return !visual || (academic && visual.kind === "image" && visual.sourceType === "image");
  });
  if (missingVisualSlides.length > 0) {
    throw new Error(`Requested visuals did not resolve on slides: ${missingVisualSlides.join(", ")}`);
  }

  stage = "PPTX rendering";
  await buildPptx(
    deck,
    "business",
    path.join(outputDir, "deck.pptx"),
    undefined,
    visuals,
    { preset: "academic", workType: "generic" }
  );

  console.log(`Generated ${deck.slides.length} slides.`);
  console.log(`Resolved ${visuals.size} visual(s).`);
  console.log(`Wrote ${path.relative(root, path.join(outputDir, "deck.json"))}`);
  console.log(`Wrote ${path.relative(root, path.join(outputDir, "deck.pptx"))}`);
} catch (error) {
  const errorType = error instanceof Error ? error.name : "UnknownError";
  const status = Number.isInteger(error?.status) ? error.status : undefined;
  let message = error instanceof Error ? error.message : "Unknown failure";
  const sensitiveEnvValues = Object.entries(process.env)
    .filter(([name, value]) => value && /key|token|secret|password|auth|credential|dsn|database|url/i.test(name))
    .map(([, value]) => value)
    .sort((a, b) => b.length - a.length);
  for (const secret of sensitiveEnvValues) message = message.split(secret).join("[REDACTED]");
  message = message.replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]").slice(0, 1000);
  const causeCodes = [];
  let cause = error?.cause;
  for (let depth = 0; cause && depth < 4; depth++, cause = cause.cause) {
    const code = typeof cause.code === "string" && /^[A-Z0-9_]+$/.test(cause.code) ? cause.code : "";
    if (code) causeCodes.push(code);
  }
  let endpointClass = "unknown";
  try {
    const endpoint = new URL(process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com");
    const host = endpoint.hostname.toLowerCase();
    const local = host === "localhost" || host === "::1" || host.startsWith("127.") ||
      host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    endpointClass = local ? "loopback/private" : "public/routable";
  } catch {
    endpointClass = "invalid-configured-url";
  }
  console.error(`Generation quality smoke failed during ${stage} (${errorType}${status ? `, status ${status}` : ""}${causeCodes.length ? `, cause ${causeCodes.join("/")}` : ""}, endpoint ${endpointClass}): ${message}`);
  process.exitCode = 1;
} finally {
  if (pexelsKey !== undefined) process.env.PEXELS_API_KEY = pexelsKey;
  if (openAiKey !== undefined) process.env.OPENAI_API_KEY = openAiKey;
  clearTimeout(timeout);
}
