import JSZip from "jszip";

// История 1: исходная работа (.docx) → извлекаем встроенные картинки/схемы/
// графики и текст. .docx — это zip: изображения лежат в word/media/*, текст —
// в word/document.xml. PDF/PPTX пока не поддерживаем.

// Форматы, которые pptxgenjs.addImage кладёт без сюрпризов. emf/wmf/svg/tiff
// из word/media пропускаем — PowerPoint их по path не всегда отрисует.
const IMG_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
};

export type DocxImage = {
  name: string;
  ext: string;
  mime: string;
  data: Buffer;
};

export type DocxContent = {
  text: string;
  images: DocxImage[];
};

export type ExtractOptions = {
  maxImages?: number; // верхняя граница числа картинок (бюджет vision/токенов)
  maxImageBytes?: number; // картинки крупнее — пропускаем
  minImageBytes?: number; // мельче — это иконки/буллеты/линии, пропускаем
  maxTextChars?: number; // обрезаем текст работы под промпт
};

const DEFAULTS: Required<ExtractOptions> = {
  maxImages: 12,
  maxImageBytes: 5 * 1024 * 1024,
  minImageBytes: 8 * 1024,
  maxTextChars: 16000,
};

// Достаточно проверки сигнатуры zip (PK\x03\x04). Полная валидность — на JSZip.
export function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  );
}

// Проверка, что zip — действительно .docx (содержит word/document.xml).
// Дёшево по сравнению с полным extractDocx — используется на загрузке.
export async function isDocx(buf: Buffer): Promise<boolean> {
  if (!looksLikeZip(buf)) return false;
  try {
    const zip = await JSZip.loadAsync(buf);
    return Boolean(zip.file("word/document.xml"));
  } catch {
    return false;
  }
}

export async function extractDocx(
  buf: Buffer,
  options?: ExtractOptions
): Promise<DocxContent> {
  const opts = { ...DEFAULTS, ...options };
  const zip = await JSZip.loadAsync(buf);

  const docXml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const text = xmlToText(docXml).slice(0, opts.maxTextChars);

  // word/media/imageN.* — сортируем по имени, чтобы порядок был стабильным и
  // близким к порядку в документе.
  const mediaPaths = Object.keys(zip.files)
    .filter((p) => /^word\/media\/[^/]+$/i.test(p) && !zip.files[p].dir)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const images: DocxImage[] = [];
  for (const p of mediaPaths) {
    if (images.length >= opts.maxImages) break;
    const ext = (p.split(".").pop() || "").toLowerCase();
    const mime = IMG_MIME_BY_EXT[ext];
    if (!mime) continue;
    const data = await zip.files[p].async("nodebuffer");
    if (data.length < opts.minImageBytes || data.length > opts.maxImageBytes) {
      continue;
    }
    images.push({ name: p.split("/").pop() ?? p, ext, mime, data });
  }

  return { text, images };
}

// Грубое, но достаточное превращение WordprocessingML в plain text: абзацы и
// табы → переводы строк/табы, остальные теги выкидываем, базовые сущности
// раскодируем.
function xmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/?>/gi, "\t")
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<w:br\b[^>]*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
