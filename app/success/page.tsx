"use client";

import { useEffect, useState } from "react";

type Status =
  | "loading"
  | "pending"
  | "generating"
  | "awaiting_manual"
  | "done"
  | "error"
  | "unknown";

export default function SuccessPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get("order");
    if (!orderId) {
      setStatus("unknown");
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/status?order=${orderId}`);
        const data = (await res.json()) as { status?: Status; filePath?: string };
        if (!active) return;

        if (data.status === "done") {
          setFileUrl(data.filePath ?? null);
          setStatus("done");
          return;
        }
        if (data.status === "awaiting_manual") {
          setStatus("awaiting_manual");
          return;
        }
        if (data.status === "error") {
          setStatus("error");
          return;
        }

        setStatus(data.status === "generating" ? "generating" : "pending");
      } catch {
        // сеть — повторим
      }
      timer = setTimeout(poll, 3000);
    }

    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <main className="success-page">
      <div className="success-shell">
        {(status === "loading" || status === "pending" || status === "generating") && (
          <div className="success-overlay">
            <div className="spinner" />
            <div className="success-title">Готовим вашу презентацию…</div>
            <div className="success-sub">
              Это занимает до минуты. Ссылка также придёт на почту — страницу можно закрыть.
            </div>
          </div>
        )}

        {status === "done" && (
          <div className="success-overlay">
            <div className="success-icon">✅</div>
            <div className="success-title">Оплата прошла!</div>
            <div className="success-sub">Генерируем вашу презентацию. Файл придёт на почту.</div>
            <div className="success-steps">
              <div className="success-step"><span className="success-step-dot" />ИИ генерирует структуру и текст слайдов</div>
              <div className="success-step"><span className="success-step-dot" />Собираем .pptx-файл</div>
              <div className="success-step"><span className="success-step-dot" />Отправляем на почту — обычно 3–5 минут</div>
            </div>
            {fileUrl && (
              <a className="btn success-download" href={fileUrl}>
                Скачать .pptx
              </a>
            )}
            <div className="success-note">
              Ссылка действует 7 дней — успейте скачать в течение недели.<br />
              Не нашли письмо? Проверьте «Спам».
            </div>
          </div>
        )}

        {status === "awaiting_manual" && (
          <div className="success-overlay">
            <div className="success-icon author">✍️</div>
            <div className="success-title">Оплата прошла!</div>
            <div className="success-sub">Дизайнер приступит после получения вашего файла</div>
            <div className="success-steps">
              <div className="success-step">
                <span className="success-step-dot amber" />
                Пришлите файл работы на <strong>custom@slidemaker.ru</strong>
              </div>
              <div className="success-step">
                <span className="success-step-dot amber" />
                Дизайнер свяжется и уточнит детали при необходимости
              </div>
              <div className="success-step">
                <span className="success-step-dot amber" />
                Готовая презентация за 48 часов на вашу почту
              </div>
            </div>
            <a className="btn btn-amber success-download" href="mailto:custom@slidemaker.ru">
              Пришлите файл на custom@slidemaker.ru
            </a>
            <div className="success-note">Ссылка в письме с готовым файлом активна 7 дней.</div>
          </div>
        )}

        {status === "error" && (
          <div className="success-overlay">
            <div className="success-title">Что-то пошло не так</div>
            <div className="success-sub">
              Не удалось сгенерировать презентацию. Напишите нам — поможем и вернём оплату.
            </div>
          </div>
        )}

        {status === "unknown" && (
          <div className="success-overlay">
            <div className="success-title">Заказ не найден</div>
            <div className="success-sub">Проверьте ссылку из письма.</div>
          </div>
        )}

        <div className="success-back">
          <a href="/">← на главную</a>
        </div>
      </div>
    </main>
  );
}
