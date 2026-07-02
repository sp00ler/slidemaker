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
  maxTables?: number; // таблицы сверх лимита пропускаем
  maxTableRows?: number; // строки сверх лимита таблицы пропускаем
  maxTableCells?: number; // ячейки сверх лимита таблицы пропускаем
};

const DEFAULTS: Required<ExtractOptions> = {
  maxImages: 12,
  maxImageBytes: 5 * 1024 * 1024,
  minImageBytes: 8 * 1024,
  maxTextChars: 16000,
  maxTables: 12,
  maxTableRows: 40,
  maxTableCells: 240,
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
  const text = xmlToText(docXml, opts).slice(0, opts.maxTextChars);

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

// Грубое, но достаточное превращение WordprocessingML в text: абзацы и табы
// сохраняем, таблицы переводим в markdown, остальные теги выкидываем.
function xmlToText(xml: string, opts: Required<ExtractOptions>): string {
  let tableCount = 0;
  return xml
    .replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/gi, (tableXml) => {
      tableCount += 1;
      if (tableCount > opts.maxTables) return "\n";
      const markdown = tableToMarkdown(tableXml, opts);
      return markdown ? `${markdown}\n` : "\n";
    })
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

function tableToMarkdown(xml: string, opts: Required<ExtractOptions>): string {
  const rows: string[][] = [];
  let cellCount = 0;

  for (const rowMatch of xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/gi)) {
    if (rows.length >= opts.maxTableRows || cellCount >= opts.maxTableCells) {
      break;
    }

    const cells: string[] = [];
    for (const cellMatch of rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/gi)) {
      if (cellCount >= opts.maxTableCells) break;
      const text = xmlFragmentToCellText(cellMatch[0]);
      cells.push(escapeMarkdownTableCell(text));
      cellCount += 1;
    }

    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return "";

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, i) => row[i] ?? "")
  );
  const separator = Array.from({ length: columnCount }, () => "---");

  return [normalizedRows[0], separator, ...normalizedRows.slice(1)]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

function xmlFragmentToCellText(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^>]*\/?>/gi, " ")
      .replace(/<w:br\b[^>]*\/?>/gi, " ")
      .replace(/<\/w:p>/gi, " ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function escapeMarkdownTableCell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
