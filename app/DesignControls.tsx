"use client";

import { useState } from "react";
import {
  DESIGN_PRESETS,
  FONT_WHITELIST,
  type DesignControlsValue,
  type DesignPreset,
  type TitleMode,
  type WorkType,
} from "@/lib/design";

const OFFICE_THEME_IDS = ["officeBlue", "officeGreen", "officeGray", "officeBurgundy", "officePurple"] as const;
const BG_SWATCHES = [
  { label: "Белый", hex: "FFFFFF" },
  { label: "Слоновая кость", hex: "FFFFF0" },
  { label: "Светло-серый", hex: "F2F2F2" },
  { label: "Тёплая бумага", hex: "F8F4E9" },
] as const;
const MAX_TITLE_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB, синхронизировано с lib/uploads

export function DesignControls({
  value,
  onChange,
  uploadToken,
}: {
  value: DesignControlsValue;
  onChange: (patch: Partial<DesignControlsValue>) => void;
  uploadToken: string;
}) {
  const [titleUploadName, setTitleUploadName] = useState("");
  const [titleUploadError, setTitleUploadError] = useState("");
  const [titleUploading, setTitleUploading] = useState(false);

  const normHex = (hex: string) => hex.replace("#", "").toUpperCase();
  const activeOffice =
    OFFICE_THEME_IDS.find((id) => {
      const p = DESIGN_PRESETS[id].palette;
      return (
        normHex(value.paletteBg) === p.bg &&
        normHex(value.paletteText) === p.text &&
        normHex(value.paletteAccent) === p.accent
      );
    }) ?? null;

  function applyOfficeTheme(id: (typeof OFFICE_THEME_IDS)[number]) {
    const theme = DESIGN_PRESETS[id].palette;
    onChange({ paletteBg: `#${theme.bg}`, paletteText: `#${theme.text}`, paletteAccent: `#${theme.accent}` });
  }

  async function uploadTitleFile(file: File | undefined) {
    if (!file || !uploadToken || titleUploading) return;
    setTitleUploadError("");
    if (file.type !== "image/png") {
      setTitleUploadError("Титульный слайд нужен в PNG");
      return;
    }
    if (file.size > MAX_TITLE_UPLOAD_SIZE) {
      setTitleUploadError("Файл больше 5 МБ");
      return;
    }

    setTitleUploading(true);
    try {
      const form = new FormData();
      form.append("uploadToken", uploadToken);
      form.append("kind", "title");
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setTitleUploadError(data.error || "Не удалось загрузить титул");
        return;
      }
      setTitleUploadName(file.name);
      onChange({ titleMode: "upload" });
    } catch {
      setTitleUploadError("Не удалось отправить файл. Проверьте интернет.");
    } finally {
      setTitleUploading(false);
    }
  }

  return (
    <>
      <div className="field">
        <label>Оформление</label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
            alignItems: "start",
          }}
          className="design-grid"
        >
          <div className="styles">
            {([
              ["academic", "Академический", "для ВКР, курсовых, докладов"],
              ["auto", "ИИ решает", "палитра и шрифты по теме"],
              ["custom", "Свои настройки", "шрифт, размер, цвета"],
            ] as const).map(([id, label, desc]) => (
              <button
                key={id}
                className={`style-opt ${value.preset === id ? "active" : ""}`}
                type="button"
                onClick={() => onChange({ preset: id as DesignPreset })}
              >
                <div className="style-label">{label}</div>
                <div className="style-desc">{desc}</div>
              </button>
            ))}
          </div>
          <DesignPreview
            preset={value.preset}
            headingFace={value.headingFace}
            bodyFace={value.bodyFace}
            headingSize={value.headingSize}
            bodySize={value.bodySize}
            bg={value.paletteBg}
            text={value.paletteText}
            accent={value.paletteAccent}
          />
        </div>
        {value.preset === "custom" && (
          <div className="disclosure-body" style={{ marginTop: "12px" }}>
            <div className="field">
              <label>Шрифт заголовков</label>
              <select value={value.headingFace} onChange={(e) => onChange({ headingFace: e.target.value })}>
                {FONT_WHITELIST.map((font) => <option key={font} value={font}>{font}</option>)}
              </select>
              <div className="field-hint">Названия слайдов — крупный, читаемый шрифт</div>
            </div>
            <div className="field">
              <label>Шрифт текста</label>
              <select value={value.bodyFace} onChange={(e) => onChange({ bodyFace: e.target.value })}>
                {FONT_WHITELIST.map((font) => <option key={font} value={font}>{font}</option>)}
              </select>
              <div className="field-hint">Буллеты и подписи на слайде</div>
            </div>
            <div className="field">
              <label>Размер заголовков (pt): {value.headingSize}</label>
              <input
                type="number"
                min={16}
                max={40}
                value={value.headingSize}
                onChange={(e) => onChange({ headingSize: Number(e.target.value) })}
              />
              <div className="field-hint">Крупно — должно читаться с задних рядов</div>
            </div>
            <div className="field">
              <label>Размер текста (pt): {value.bodySize}</label>
              <input
                type="number"
                min={16}
                max={40}
                value={value.bodySize}
                onChange={(e) => onChange({ bodySize: Number(e.target.value) })}
              />
              <div className="field-hint">Для аудитории обычно ≥24pt</div>
            </div>
            <div className="field">
              <label>Фон слайда (подложка)</label>
              <div className="color-field">
                <input
                  type="color"
                  value={value.paletteBg}
                  onChange={(e) => onChange({ paletteBg: e.target.value })}
                />
                <input
                  type="text"
                  value={value.paletteBg}
                  onChange={(e) => onChange({ paletteBg: e.target.value })}
                  placeholder="#FFFFFF"
                />
              </div>
              <div className="bg-swatches">
                {BG_SWATCHES.map((s) => (
                  <button
                    key={s.hex}
                    type="button"
                    className={`bg-swatch ${normHex(value.paletteBg) === s.hex ? "active" : ""}`}
                    style={{ background: `#${s.hex}` }}
                    title={s.label}
                    onClick={() => onChange({ paletteBg: `#${s.hex}` })}
                  />
                ))}
              </div>
              <div className="field-hint">Клик по свотчу подставляет фон — {BG_SWATCHES.map((s) => s.label).join(", ")}</div>
            </div>
            <div className="field">
              <label>Цвет текста</label>
              <div className="color-field">
                <input
                  type="color"
                  value={value.paletteText}
                  onChange={(e) => onChange({ paletteText: e.target.value })}
                />
                <input
                  type="text"
                  value={value.paletteText}
                  onChange={(e) => onChange({ paletteText: e.target.value })}
                  placeholder="#1A1A1A"
                />
              </div>
              <div className="field-hint">Основной текст слайдов — должен контрастировать с фоном</div>
            </div>
            <div className="field">
              <label>Акцентный цвет — линии, номера</label>
              <div className="color-field">
                <input
                  type="color"
                  value={value.paletteAccent}
                  onChange={(e) => onChange({ paletteAccent: e.target.value })}
                />
                <input
                  type="text"
                  value={value.paletteAccent}
                  onChange={(e) => onChange({ paletteAccent: e.target.value })}
                  placeholder="#1F3A5F"
                />
              </div>
              <div className="field-hint">Только подчёркивания, нумерация, штрихи — не заливка фона</div>
            </div>
            <div className="field">
              <label>Готовые темы</label>
              <div className="office-tiles">
                {OFFICE_THEME_IDS.map((id) => {
                  const theme = DESIGN_PRESETS[id].palette;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`office-tile ${activeOffice === id ? "active" : ""}`}
                      onClick={() => applyOfficeTheme(id)}
                    >
                      <div className="office-dots">
                        <span className="color-dot" style={{ background: `#${theme.bg}` }} />
                        <span className="color-dot" style={{ background: `#${theme.text}` }} />
                        <span className="color-dot" style={{ background: `#${theme.accent}` }} />
                      </div>
                      <div className="style-label">{DESIGN_PRESETS[id].label}</div>
                    </button>
                  );
                })}
              </div>
              <div className="field-hint">Нажмите — цвета подставятся выше</div>
            </div>
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="workType">Тип работы</label>
        <select
          id="workType"
          value={value.workType}
          onChange={(e) => onChange({ workType: e.target.value as WorkType })}
        >
          <option value="generic">Обычная презентация</option>
          <option value="vkr">ВКР / диплом</option>
          <option value="coursework">Курсовая</option>
          <option value="report">Доклад / реферат</option>
        </select>
      </div>

      <div className="field">
        <label>Первый слайд</label>
        <div className="styles">
          {([
            ["auto", "Сгенерировать", "титул сделает ИИ"],
            ["self", "Оформлю сам", "без титульного слайда"],
            ["upload", "Загрузить PNG", "готовый титул первым"],
          ] as const).map(([id, label, desc]) => (
            <button
              key={id}
              className={`style-opt ${value.titleMode === id ? "active" : ""}`}
              type="button"
              onClick={() => onChange({ titleMode: id as TitleMode })}
            >
              <div className="style-label">{label}</div>
              <div className="style-desc">{desc}</div>
            </button>
          ))}
        </div>
        {value.titleMode === "upload" && uploadToken && (
          <div className="field" style={{ marginTop: "12px" }}>
            <label className="slide-action">
              {titleUploading ? "загружаем..." : titleUploadName || "выбрать PNG-титул"}
              <input type="file" accept="image/png" disabled={titleUploading} onChange={(e) => uploadTitleFile(e.target.files?.[0])} />
            </label>
            {titleUploadError && <div className="slide-error">{titleUploadError}</div>}
          </div>
        )}
      </div>
    </>
  );
}

function DesignPreview({
  preset,
  headingFace,
  bodyFace,
  headingSize,
  bodySize,
  bg,
  text,
  accent,
}: {
  preset: DesignPreset;
  headingFace: string;
  bodyFace: string;
  headingSize: number;
  bodySize: number;
  bg: string;
  text: string;
  accent: string;
}) {
  const disclaimer = (
    <div style={{ marginTop: "8px", fontSize: "11px", color: "#8a8a8a", textAlign: "center" }}>
      Превью схематично — реальный слайд оформляется точнее
    </div>
  );

  // ИИ решает — конкретного оформления нет, показываем заглушку.
  if (preset === "auto") {
    return (
      <div>
        <div
          style={{
            aspectRatio: "16 / 9",
            border: "1px solid #e2e2e2",
            borderRadius: "8px",
            background: "#f6f6f4",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "14px",
            textAlign: "center",
            color: "#7a7a7a",
            fontSize: "12px",
            lineHeight: 1.4,
          }}
        >
          ИИ подберёт палитру и шрифты под вашу тему
        </div>
        {disclaimer}
      </div>
    );
  }

  const academic = preset === "academic";
  const slideBg = academic ? "#FFFFFF" : bg;
  const ink = academic ? "#1A1A1A" : text;
  const line = academic ? "#1F3A5F" : accent;
  const headFace = academic ? "Arial" : headingFace;
  const bodyF = academic ? "Arial" : bodyFace;
  const headPt = academic ? 32 : headingSize;
  const bodyPt = academic ? 24 : bodySize;
  // pt → px в мокапе (слайд ~1280px ужат до ~300px).
  const headPx = Math.max(11, Math.round(headPt * 0.42));
  const bodyPx = Math.max(8, Math.round(bodyPt * 0.42));

  const rows = ["Анализ предметной области", "Проектирование архитектуры", "Программная реализация"];

  return (
    <div>
      <div
        style={{
          aspectRatio: "16 / 9",
          border: "1px solid #d9d9d9",
          borderRadius: "8px",
          background: slideBg,
          padding: "14px 16px",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Заголовок: academic — ALL-CAPS по центру + подчёркивание */}
        <div style={{ textAlign: academic ? "center" : "left" }}>
          <span
            style={{
              fontFamily: `"${headFace}", sans-serif`,
              fontSize: `${headPx}px`,
              fontWeight: 700,
              color: ink,
              letterSpacing: academic ? "0.04em" : "0",
              textTransform: academic ? "uppercase" : "none",
              lineHeight: 1.15,
            }}
          >
            {academic ? "Задачи исследования" : "Заголовок слайда"}
          </span>
          <div
            style={{
              height: "3px",
              width: academic ? "42%" : "28%",
              background: line,
              margin: academic ? "6px auto 0" : "6px 0 0",
              borderRadius: "2px",
            }}
          />
        </div>

        {/* Строки: academic — нумерация с вертикальным штрихом; custom — маркеры */}
        <div
          style={{
            marginTop: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "7px",
            flex: 1,
            justifyContent: "center",
          }}
        >
          {rows.map((row, i) => (
            <div key={row} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {academic ? (
                <>
                  <span style={{ width: "3px", alignSelf: "stretch", background: line, borderRadius: "2px" }} />
                  <span style={{ fontFamily: `"${headFace}", sans-serif`, fontWeight: 700, color: line, fontSize: `${bodyPx}px`, minWidth: "12px" }}>
                    {i + 1}
                  </span>
                </>
              ) : (
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: line, flexShrink: 0 }} />
              )}
              <span style={{ fontFamily: `"${bodyF}", sans-serif`, fontSize: `${bodyPx}px`, color: ink, lineHeight: 1.2 }}>
                {row}
              </span>
            </div>
          ))}
        </div>
      </div>

      {academic && (
        <div style={{ marginTop: "8px", fontSize: "12px", color: line, textAlign: "center", fontWeight: 600 }}>
          Стиль по умолчанию — академический
        </div>
      )}
      {disclaimer}
    </div>
  );
}
