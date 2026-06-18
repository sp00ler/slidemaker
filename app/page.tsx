"use client";

import { useState } from "react";
import { TARIFFS, STYLES, StyleId, MIN_SLIDES, Tariff } from "@/lib/tariffs";

export default function Home() {
  const [tariffId, setTariffId] = useState<Tariff["id"]>("basic");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(MIN_SLIDES);
  const [style, setStyle] = useState<StyleId>("business");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tariff = TARIFFS[tariffId];

  function selectTariff(id: Tariff["id"]) {
    setTariffId(id);
    // подрезаем число слайдов под лимит выбранного тарифа
    setSlideCount((n) => Math.min(n, TARIFFS[id].maxSlides));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Введите корректный email");
      return;
    }
    if (topic.trim().length < 3) {
      setError("Опишите тему презентации");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          tariff: tariffId,
          slideCount,
          topic: topic.trim(),
          style,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка. Попробуйте ещё раз.");
        setLoading(false);
        return;
      }
      window.location.href = data.confirmationUrl;
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <section className="hero">
        <h1>Презентация по теме — за минуту</h1>
        <p>
          Опишите тему, выберите стиль и количество слайдов. Готовый файл .pptx
          придёт вам на почту.
        </p>
      </section>

      <div className="tariffs">
        {(Object.values(TARIFFS) as Tariff[]).map((t) => (
          <div
            key={t.id}
            className={`tariff-card ${tariffId === t.id ? "active" : ""}`}
            onClick={() => selectTariff(t.id)}
          >
            <div className="name">{t.name}</div>
            <div className="price">
              {t.price} ₽
            </div>
            <div className="limit">до {t.maxSlides} слайдов</div>
          </div>
        ))}
      </div>

      <form className="card" onSubmit={handleSubmit}>
        {error && <div className="error">{error}</div>}

        <div className="field">
          <label htmlFor="email">Email для получения файла</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="topic">Тема презентации</label>
          <input
            id="topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Например: Внедрение ИИ в розничной торговле"
            maxLength={300}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="slides">
            Количество слайдов: {slideCount}
          </label>
          <input
            id="slides"
            type="range"
            min={MIN_SLIDES}
            max={tariff.maxSlides}
            value={slideCount}
            onChange={(e) => setSlideCount(Number(e.target.value))}
          />
          <div className="hint">
            от {MIN_SLIDES} до {tariff.maxSlides} (лимит тарифа «{tariff.name}»)
          </div>
        </div>

        <div className="field">
          <label>Стиль оформления</label>
          <div className="styles">
            {(Object.keys(STYLES) as StyleId[]).map((id) => (
              <div
                key={id}
                className={`style-opt ${style === id ? "active" : ""}`}
                onClick={() => setStyle(id)}
              >
                {STYLES[id].label}
              </div>
            ))}
          </div>
        </div>

        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Переходим к оплате…" : `Оплатить ${tariff.price} ₽`}
        </button>
        <div className="total">
          Оплата через ЮКассу. После оплаты презентация придёт на {email || "ваш email"}.
        </div>
      </form>

      <div className="footer">slidemaker.ru</div>
    </main>
  );
}
