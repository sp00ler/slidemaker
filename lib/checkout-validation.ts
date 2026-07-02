import { z } from "zod";
import type { DesignSpec } from "@/lib/design";

export function parseOptionalText(
  value: unknown,
  maxLength: number,
  label: string
): { value: string | null; error?: string } {
  const text = String(value || "").trim();
  if (text.length > maxLength) {
    return { value: null, error: `${label} не должен превышать ${maxLength} символов` };
  }

  return { value: text || null };
}

const FONT_WHITELIST = [
  "Times New Roman",
  "Arial",
  "Tahoma",
  "Verdana",
  "Calibri",
] as const;

const ACADEMIC_PALETTE = { bg: "FFFFFF", text: "1A1A1A", accent: "1F3A5F" } as const;

const HEX_RE = /^#?[0-9a-f]{6}$/i;

function normalizeHex(value: string): string {
  return value.replace(/^#/, "").toUpperCase();
}

const hexSchema = z
  .string()
  .trim()
  .regex(HEX_RE, "Цвет должен быть в формате #RRGGBB")
  .transform(normalizeHex);

const fontFaceSchema = z.enum(FONT_WHITELIST);
const fontSizeSchema = z.coerce
  .number()
  .int("Размер шрифта должен быть целым числом")
  .min(16, "Размер шрифта должен быть от 16 до 40 pt")
  .max(40, "Размер шрифта должен быть от 16 до 40 pt");

const RawDesignPrefsSchema = z.object({
  preset: z.enum(["academic", "auto", "custom"]).default("academic"),
  workType: z.enum(["vkr", "coursework", "report", "generic"]).default("generic"),
  title: z
    .object({
      mode: z.enum(["auto", "self", "upload"]).default("auto"),
      fileId: z.string().trim().max(80).optional(),
    })
    .default({ mode: "auto" }),
  fonts: z
    .object({
      heading: z
        .object({
          face: fontFaceSchema.optional(),
          size: fontSizeSchema.optional(),
          bold: z.boolean().optional(),
          italic: z.boolean().optional(),
        })
        .optional(),
      body: z
        .object({
          face: fontFaceSchema.optional(),
          size: fontSizeSchema.optional(),
        })
        .optional(),
    })
    .optional(),
  palette: z
    .object({
      bg: hexSchema.optional(),
      text: hexSchema.optional(),
      accent: hexSchema.optional(),
    })
    .optional(),
});

export function parseDesignPrefs(
  value: unknown
): { value: DesignSpec | null; error?: string } {
  const parsed = RawDesignPrefsSchema.safeParse(value ?? { preset: "academic" });
  if (!parsed.success) {
    return {
      value: null,
      error: parsed.error.issues[0]?.message ?? "Некорректные настройки оформления",
    };
  }

  const raw = parsed.data;
  if (raw.preset === "auto") return { value: null };

  const academicPalette = ACADEMIC_PALETTE;
  const prefs: DesignSpec = {
    preset: raw.preset,
    workType: raw.workType,
    title: raw.title,
  };

  if (raw.preset === "academic") {
    prefs.fonts = {
      heading: { face: raw.fonts?.heading?.face ?? "Arial", size: raw.fonts?.heading?.size ?? 32 },
      body: { face: raw.fonts?.body?.face ?? "Arial", size: raw.fonts?.body?.size ?? 24 },
    };
    prefs.palette = {
      bg: raw.palette?.bg ?? academicPalette.bg,
      text: raw.palette?.text ?? academicPalette.text,
      accent: raw.palette?.accent ?? academicPalette.accent,
    };
    return { value: prefs };
  }

  prefs.fonts = raw.fonts;
  prefs.palette = raw.palette;
  return { value: prefs };
}