import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "SlideMaker — готовая презентация .pptx за минуту";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Подгружаем кириллический Inter из Google Fonts, иначе текст рендерится тофу.
async function loadInter(text: string, weight: 400 | 800): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(
        text
      )}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\('woff2'\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const title = "SlideMaker";
  const sub = "Готовая презентация .pptx на почту за минуту";
  const tag = "ИИ + живой дизайнер · от 299 ₽ · оплата ЮKassa";

  const [bold, regular] = await Promise.all([
    loadInter(title, 800),
    loadInter(sub + tag, 400),
  ]);
  const fonts = [
    bold && { name: "Inter", data: bold, weight: 800 as const, style: "normal" as const },
    regular && { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 800; style: "normal" }[];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background:
            "radial-gradient(120% 120% at 80% 0%, #2A59E8 0%, #1E4DD8 45%, #0d1326 100%)",
          color: "#fff",
          fontFamily: "Inter",
        }}
      >
        {/* мини-дек как в иконке */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 40 }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 18,
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderTop: "20px solid transparent",
                borderBottom: "20px solid transparent",
                borderLeft: "32px solid #1E4DD8",
              }}
            />
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, opacity: 0.92 }}>slidemaker.ru</div>
        </div>

        <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {title}
        </div>
        <div style={{ fontSize: 46, fontWeight: 400, marginTop: 28, maxWidth: 900 }}>{sub}</div>
        <div style={{ fontSize: 30, fontWeight: 400, marginTop: 36, opacity: 0.82 }}>{tag}</div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
}
