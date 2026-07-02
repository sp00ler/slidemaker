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