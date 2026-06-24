"use client";

import { FormEvent, useState } from "react";
import { MIN_SLIDES, STYLES, StyleId, TARIFFS } from "@/lib/tariffs";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <button className="account-link" type="button" onClick={logout}>
      Выйти
    </button>
  );
}

export function RegenerateForm({
  orderId,
  initialTopic,
  initialStyle,
  initialSlideCount,
}: {
  orderId: string;
  initialTopic: string;
  initialStyle: string;
  initialSlideCount: number;
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [style, setStyle] = useState<StyleId>(
    STYLES[initialStyle as StyleId] ? (initialStyle as StyleId) : "business"
  );
  const [slideCount, setSlideCount] = useState(
    Math.min(Math.max(initialSlideCount || MIN_SLIDES, MIN_SLIDES), TARIFFS.standard.maxSlides)
  );
  const [wishes, setWishes] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatus("");
    const res = await fetch("/api/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, topic, style, slideCount, wishes }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setStatus(data.error || "Не удалось запустить генерацию");
      setLoading(false);
      return;
    }
    setStatus("Новая генерация запущена. Файл придёт на почту.");
    setLoading(false);
  }

  return (
    <form className="regen-form" onSubmit={onSubmit}>
      <div className="account-badge">Вторая генерация активна</div>
      <div className="field">
        <label htmlFor={`topic-${orderId}`}>Тема</label>
        <input
          id={`topic-${orderId}`}
          type="text"
          value={topic}
          minLength={3}
          maxLength={300}
          onChange={(e) => setTopic(e.target.value)}
          required
        />
      </div>
      <div className="regen-row">
        <div className="field">
          <label htmlFor={`slides-${orderId}`}>Слайды</label>
          <input
            id={`slides-${orderId}`}
            type="number"
            min={MIN_SLIDES}
            max={TARIFFS.standard.maxSlides}
            value={slideCount}
            onChange={(e) => setSlideCount(Number(e.target.value))}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`style-${orderId}`}>Стиль</label>
          <select
            id={`style-${orderId}`}
            value={style}
            onChange={(e) => setStyle(e.target.value as StyleId)}
          >
            {Object.entries(STYLES).map(([id, item]) => (
              <option key={id} value={id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`wishes-${orderId}`}>Пожелания</label>
        <textarea
          id={`wishes-${orderId}`}
          value={wishes}
          maxLength={500}
          onChange={(e) => setWishes(e.target.value)}
          placeholder="Что изменить во второй версии"
        />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Запускаем..." : "Сгенерировать ещё раз"}
      </button>
      {status && <div className="field-hint">{status}</div>}
    </form>
  );
}
