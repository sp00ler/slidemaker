import crypto from "crypto";
import path from "path";
import { promises as fs } from "fs";
import { pool } from "@/lib/db";
import { isDocx } from "@/lib/docx";

export const MAX_UPLOAD_SLIDE = 15;
export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
// Исходная работа (.docx) может быть тяжелее картинки слайда: в ней свои
// изображения.
export const MAX_SOURCE_SIZE = 25 * 1024 * 1024;
export const SOURCE_SLIDE_NUMBER = 0; // sentinel: source-строка не привязана к слайду

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type UploadFileInput = {
  uploadToken: string;
  slideNumber: number;
  file: File;
  description: string | null;
};

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function detectImageMime(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export function validateUploadInput(input: {
  uploadToken: string;
  slideNumber: number;
  declaredMime: string;
  size: number;
  bytes: Uint8Array;
}): { ok: true; mime: string; ext: string } | { ok: false; error: string } {
  if (!isUuid(input.uploadToken)) {
    return { ok: false, error: "Некорректный uploadToken" };
  }
  if (
    !Number.isInteger(input.slideNumber) ||
    input.slideNumber < 1 ||
    input.slideNumber > MAX_UPLOAD_SLIDE
  ) {
    return { ok: false, error: `slideNumber должен быть от 1 до ${MAX_UPLOAD_SLIDE}` };
  }
  if (input.size <= 0 || input.size > MAX_UPLOAD_SIZE) {
    return { ok: false, error: "Файл должен быть не больше 5 МБ" };
  }
  if (!MIME_TO_EXT[input.declaredMime]) {
    return { ok: false, error: "Разрешены только PNG, JPEG или WebP" };
  }

  const detectedMime = detectImageMime(input.bytes);
  if (!detectedMime || detectedMime !== input.declaredMime) {
    return { ok: false, error: "Файл не похож на изображение заявленного типа" };
  }

  return { ok: true, mime: detectedMime, ext: MIME_TO_EXT[detectedMime] };
}

export function resolveUploadPath(uploadToken: string, fileName: string): {
  dir: string;
  absolutePath: string;
  relativePath: string;
} {
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const dir = path.resolve(uploadsRoot, uploadToken);
  const absolutePath = path.resolve(dir, fileName);

  if (
    !dir.startsWith(uploadsRoot + path.sep) ||
    !absolutePath.startsWith(uploadsRoot + path.sep)
  ) {
    throw new Error("Unsafe upload path");
  }

  return {
    dir,
    absolutePath,
    relativePath: path.relative(process.cwd(), absolutePath),
  };
}

export async function saveUpload(input: UploadFileInput): Promise<{ slideNumber: number }> {
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const validation = validateUploadInput({
    uploadToken: input.uploadToken,
    slideNumber: input.slideNumber,
    declaredMime: input.file.type,
    size: input.file.size,
    bytes,
  });

  if (!validation.ok) {
    throw new UploadError(validation.error);
  }

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count
     FROM order_files
     WHERE upload_token = $1 AND kind = 'slide' AND slide_number <> $2`,
    [input.uploadToken, input.slideNumber]
  );
  if (Number(countResult.rows[0]?.count ?? 0) >= MAX_UPLOAD_SLIDE) {
    throw new UploadError(`Не больше ${MAX_UPLOAD_SLIDE} файлов на заказ`);
  }

  const oldResult = await pool.query<{ stored_path: string }>(
    `SELECT stored_path FROM order_files
     WHERE upload_token = $1 AND slide_number = $2
     LIMIT 1`,
    [input.uploadToken, input.slideNumber]
  );

  const token = crypto.randomBytes(8).toString("hex");
  const fileName = `slide_${input.slideNumber}_${token}.${validation.ext}`;
  const { dir, absolutePath, relativePath } = resolveUploadPath(input.uploadToken, fileName);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(absolutePath, bytes);

  if (oldResult.rows[0]) {
    await pool.query(
      `UPDATE order_files
       SET stored_path = $3, mime = $4, size = $5, description = $6, created_at = now()
       WHERE upload_token = $1 AND slide_number = $2`,
      [
        input.uploadToken,
        input.slideNumber,
        relativePath,
        validation.mime,
        input.file.size,
        input.description,
      ]
    );
    await removeStoredUpload(oldResult.rows[0].stored_path).catch(() => {});
  } else {
    await pool.query(
      `INSERT INTO order_files
       (upload_token, order_id, slide_number, stored_path, mime, size, description)
       VALUES ($1, NULL, $2, $3, $4, $5, $6)`,
      [
        input.uploadToken,
        input.slideNumber,
        relativePath,
        validation.mime,
        input.file.size,
        input.description,
      ]
    );
  }

  console.info("upload stored:", {
    uploadToken: input.uploadToken,
    slideNumber: input.slideNumber,
    size: input.file.size,
  });

  return { slideNumber: input.slideNumber };
}

// История 1: загрузка исходной работы (.docx). Хранится строкой order_files с
// kind='source' (slide_number = 0). Один источник на upload_token — повторная
// загрузка заменяет прежний.
export async function saveSourceUpload(input: {
  uploadToken: string;
  file: File;
}): Promise<{ ok: true }> {
  if (!isUuid(input.uploadToken)) {
    throw new UploadError("Некорректный uploadToken");
  }
  if (input.file.size <= 0 || input.file.size > MAX_SOURCE_SIZE) {
    throw new UploadError("Файл должен быть не больше 25 МБ");
  }

  const bytes = Buffer.from(await input.file.arrayBuffer());
  if (!(await isDocx(bytes))) {
    throw new UploadError("Загрузите файл .docx (Word)");
  }

  const old = await pool.query<{ stored_path: string }>(
    `SELECT stored_path FROM order_files
     WHERE upload_token = $1 AND kind = 'source'
     LIMIT 1`,
    [input.uploadToken]
  );

  const token = crypto.randomBytes(8).toString("hex");
  const fileName = `source_${token}.docx`;
  const { dir, absolutePath, relativePath } = resolveUploadPath(
    input.uploadToken,
    fileName
  );

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(absolutePath, bytes);

  const mime =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (old.rows[0]) {
    await pool.query(
      `UPDATE order_files
       SET stored_path = $2, mime = $3, size = $4, created_at = now()
       WHERE upload_token = $1 AND kind = 'source'`,
      [input.uploadToken, relativePath, mime, input.file.size]
    );
    await removeStoredUpload(old.rows[0].stored_path).catch(() => {});
  } else {
    await pool.query(
      `INSERT INTO order_files
       (upload_token, order_id, slide_number, stored_path, mime, size, description, kind)
       VALUES ($1, NULL, $2, $3, $4, $5, NULL, 'source')`,
      [input.uploadToken, SOURCE_SLIDE_NUMBER, relativePath, mime, input.file.size]
    );
  }

  console.info("source doc stored:", {
    uploadToken: input.uploadToken,
    size: input.file.size,
  });

  return { ok: true };
}

async function removeStoredUpload(storedPath: string): Promise<void> {
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const absolutePath = path.resolve(process.cwd(), storedPath);
  if (!absolutePath.startsWith(uploadsRoot + path.sep)) {
    return;
  }
  await fs.unlink(absolutePath);
}

export class UploadError extends Error {}
