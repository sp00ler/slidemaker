"use client";

import { FormEvent, useEffect, useState } from "react";
import { MIN_SLIDES, STYLES, StyleId } from "@/lib/tariffs";
import { SourceUploader } from "../SourceUploader";

const STORYBOARD_MAX = 1000;
const WISHES_MAX = 2000;

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
  maxSlides,
}: {
  orderId: string;
  initialTopic: string;
  initialStyle: string;
  initialSlideCount: number;
  maxSlides: number;
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [style, setStyle] = useState<StyleId>(
    STYLES[initialStyle as StyleId] ? (initialStyle as StyleId) : "business"
  );
  const [slideCount, setSlideCount] = useState(
    Math.min(Math.max(initialSlideCount || MIN_SLIDES, MIN_SLIDES), maxSlides)
  );
  const [wishes, setWishes] = useState("");
  const [storyboard, setStoryboard] = useState("");
  const [uploadToken, setUploadToken] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  // uploadToken только на клиенте — иначе SSR/hydration mismatch.
  useEffect(() => {
    setUploadToken(globalThis.crypto.randomUUID());
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatus("");
    const res = await fetch("/api/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        topic,
        style,
        slideCount,
        wishes,
        storyboard,
        uploadToken,
      }),
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
            max={maxSlides}
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
      {uploadToken && (
        <details className="details-field">
          <summary>+ Загрузить исходную работу .docx (необязательно)<span>▼</span></summary>
          <div className="disclosure-body">
            <div className="disclosure-hint">
              Новая тема или другая работа? Загрузите .docx — ИИ возьмёт её текст и иллюстрации за основу.
            </div>
            <SourceUploader uploadToken={uploadToken} />
          </div>
        </details>
      )}
      <details className="details-field">
        <summary>+ Сценарий по слайдам (необязательно)<span>▼</span></summary>
        <div className="disclosure-body">
          <div className="field" style={{ marginBottom: 0 }}>
            <textarea
              id={`storyboard-${orderId}`}
              value={storyboard}
              maxLength={STORYBOARD_MAX}
              onChange={(e) => setStoryboard(e.target.value)}
              placeholder="Слайд 1 — Введение; Слайд 2 — Проблема; Слайд 3 — …"
            />
          </div>
        </div>
      </details>
      <details className="details-field">
        <summary>+ Пожелания (необязательно)<span>▼</span></summary>
        <div className="disclosure-body">
          <div className="field" style={{ marginBottom: 0 }}>
            <textarea
              id={`wishes-${orderId}`}
              value={wishes}
              maxLength={WISHES_MAX}
              onChange={(e) => setWishes(e.target.value)}
              placeholder="Тон, акцент, структура, что важно включить. Можно расписать по слайдам — что на каком должно быть."
            />
            <div
              className={`char-counter${
                wishes.length >= WISHES_MAX
                  ? " full"
                  : wishes.length >= WISHES_MAX * 0.8
                    ? " warn"
                    : ""
              }`}
            >
              {wishes.length} / {WISHES_MAX}
            </div>
          </div>
        </div>
      </details>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Запускаем..." : "Сгенерировать ещё раз"}
      </button>
      {status && <div className="field-hint">{status}</div>}
    </form>
  );
}
