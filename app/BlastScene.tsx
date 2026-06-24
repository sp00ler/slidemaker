"use client";

import { useEffect, useState } from "react";

// Чистая сцена «документ → колода слайдов». Переиспользуется:
// - upload (.docx) — с реальным percent в doc-fill, фаза process включает анимацию;
// - оплата — inline в карточке (processing, без percent);
// - генерация — внутри полноэкранного GenerationBlast.
export function BlastScene({
  percent,
  processing = true,
}: {
  percent?: number;
  processing?: boolean;
}) {
  return (
    <div className={`blast-scene ${processing ? "is-process" : ""}`}>
      <div className="doc">
        {percent != null && (
          <div className="doc-fill" style={{ height: `${percent}%` }} />
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
      <BlastScene processing />
      <div className="blast-text">
        <div className="blast-label">{GEN_PHRASES[i]}</div>
        {sub && <div className="blast-file">{sub}</div>}
      </div>
    </div>
  );
}
