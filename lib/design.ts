export type DesignPreset = "academic" | "auto" | "custom";
export type WorkType = "vkr" | "coursework" | "report" | "generic";
export type TitleMode = "auto" | "self" | "upload";

export type DesignSpec = {
  preset?: DesignPreset;
  workType?: WorkType;
  title?: { mode?: TitleMode; fileId?: string };
  fonts?: {
    heading?: { face?: string; size?: number; bold?: boolean; italic?: boolean };
    body?: { face?: string; size?: number };
  };
  palette?: { bg?: string; text?: string; accent?: string };
};

export const FONT_WHITELIST = [
  "Times New Roman",
  "Arial",
  "Tahoma",
  "Verdana",
  "Calibri",
] as const;

// Плоское представление DesignSpec для контролируемых полей формы (главная + ЛК).
export type DesignControlsValue = {
  preset: DesignPreset;
  workType: WorkType;
  titleMode: TitleMode;
  headingFace: string;
  bodyFace: string;
  headingSize: number;
  bodySize: number;
  paletteBg: string;
  paletteText: string;
  paletteAccent: string;
};

export function defaultDesignValue(): DesignControlsValue {
  return {
    preset: "academic",
    workType: "generic",
    titleMode: "auto",
    headingFace: "Arial",
    bodyFace: "Arial",
    headingSize: 32,
    bodySize: 24,
    paletteBg: "#FFFFFF",
    paletteText: "#1A1A1A",
    paletteAccent: "#1F3A5F",
  };
}

// ЛК: реген стартует со значений родительского заказа, юзер их правит.
export function designSpecToValue(spec: DesignSpec | null | undefined): DesignControlsValue {
  const d = defaultDesignValue();
  if (!spec) return d;
  return {
    preset: spec.preset ?? d.preset,
    workType: spec.workType ?? d.workType,
    titleMode: spec.title?.mode ?? d.titleMode,
    headingFace: spec.fonts?.heading?.face ?? d.headingFace,
    bodyFace: spec.fonts?.body?.face ?? d.bodyFace,
    headingSize: spec.fonts?.heading?.size ?? d.headingSize,
    bodySize: spec.fonts?.body?.size ?? d.bodySize,
    paletteBg: spec.palette?.bg ? `#${spec.palette.bg.replace(/^#/, "")}` : d.paletteBg,
    paletteText: spec.palette?.text ? `#${spec.palette.text.replace(/^#/, "")}` : d.paletteText,
    paletteAccent: spec.palette?.accent ? `#${spec.palette.accent.replace(/^#/, "")}` : d.paletteAccent,
  };
}

export function designValueToSpec(value: DesignControlsValue): DesignSpec | null {
  // auto: оформление решает ИИ, но workType (каркас) и титул — контент, едут всегда.
  if (value.preset === "auto") {
    return {
      preset: "auto",
      workType: value.workType,
      title: { mode: value.titleMode },
    };
  }
  return {
    preset: value.preset,
    workType: value.workType,
    title: { mode: value.titleMode },
    fonts: {
      heading: { face: value.headingFace, size: value.headingSize },
      body: { face: value.bodyFace, size: value.bodySize },
    },
    palette: { bg: value.paletteBg, text: value.paletteText, accent: value.paletteAccent },
  };
}

export const DESIGN_PRESETS: Record<
  "academic" | "officeBlue" | "officeGreen" | "officeGray" | "officeBurgundy" | "officePurple",
  { label: string; palette: { bg: string; text: string; accent: string } }
> = {
  academic: {
    label: "Академический",
    palette: { bg: "FFFFFF", text: "1A1A1A", accent: "1F3A5F" },
  },
  officeBlue: {
    label: "Office Blue",
    palette: { bg: "FFFFFF", text: "1F2937", accent: "2563EB" },
  },
  officeGreen: {
    label: "Office Green",
    palette: { bg: "FFFFFF", text: "1F2937", accent: "2F6B3F" },
  },
  officeGray: {
    label: "Office Gray",
    palette: { bg: "FFFFFF", text: "222222", accent: "6B7280" },
  },
  officeBurgundy: {
    label: "Office Burgundy",
    palette: { bg: "FFFFFF", text: "241D1F", accent: "7F1D1D" },
  },
  officePurple: {
    label: "Office Purple",
    palette: { bg: "FFFFFF", text: "241D33", accent: "6D28D9" },
  },
};