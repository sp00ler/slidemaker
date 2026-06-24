"use client";

import { useEffect, useState } from "react";

// Чистая сцена «документ → колода слайдов». Переиспользуется:
// - upload (.docx) — с реальным percent в doc-fill, фаза process включает анимацию;
// - оплата — inline в карточке (simulate: фейковая заливка, нет реального percent);
// - генерация — внутри полноэкранного GenerationBlast (simulate).
// simulate: сам анимирует doc-fill 0→100 и держит, когда реального percent нет —
// чтобы оплата/генерация выглядели так же «охуенно», как upload, а не просто колодой.
export function BlastScene({
  percent,
  processing = true,
  simulate = false,
}: {
  percent?: number;
  processing?: boolean;
  simulate?: boolean;
}) {
  const [simPercent, setSimPercent] = useState(0);

  useEffect(() => {
    if (!simulate || percent != null) return;
    let raf = 0;
    const start = performance.now();
    const DURATION = 4000; // мс до полной заливки, затем держим 100
    const tick = (now: number) => {
      const p = Math.min(100, Math.round(((now - start) / DURATION) * 100));
      setSimPercent(p);
      if (p < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [simulate, percent]);

  const fill = percent != null ? percent : simulate ? simPercent : null;

  return (
    <div className={`blast-scene ${processing ? "is-process" : ""}`}>
      <div className="doc">
        {fill != null && (
          <div className="doc-fill" style={{ height: `${fill}%` }} />
        )}
        <div className="doc-body">
          <span className="doc-line" />
          <span className="doc-line" />
          <span className="doc-line short" />
          <span className="doc-pic" />
          <span className="doc-line" />
          <span className="doc-line short" />
        </div>
        <div className="doc-scan" />
      </div>

      <div className="deck">
        <span className="deck-slide ds1" />
        <span className="deck-slide ds2" />
        <span className="deck-slide ds3" />
      </div>

      <span className="chip ch1" />
      <span className="chip ch2" />
      <span className="chip ch3" />
    </div>
  );
}

const GEN_PHRASES = [
  "Собираем структуру",
  "Пишем текст слайдов",
  "Подбираем картинки",
  "Рисуем графики и схемы",
  "Оформляем дизайн",
  "Почти готово",
];

// Полноэкранный blast на время ожидания генерации презентации.
export function GenerationBlast({ sub }: { sub?: string }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % GEN_PHRASES.length), 1100);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="blast" role="status" aria-live="polite" aria-label={GEN_PHRASES[i]}>
      <BlastScene processing simulate />
      <div className="blast-text">
        <div className="blast-label">{GEN_PHRASES[i]}</div>
        {sub && <div className="blast-file">{sub}</div>}
      </div>
    </div>
  );
}
