"use client";

import { useEffect, useState } from "react";

type Status = "loading" | "pending" | "generating" | "done" | "error" | "unknown";

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
        const data = await res.json();
        if (!active) return;

        if (data.status === "done") {
          setFileUrl(data.filePath);
          setStatus("done");
          return;
        }
        if (data.status === "error") {
          setStatus("error");
          return;
        }
        // pending / generating — продолжаем опрос
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
    <main className="container">
      <div className="center-box">
        {(status === "loading" ||
          status === "pending" ||
          status === "generating") && (
          <>
            <div className="spinner" />
            <h1>Готовим вашу презентацию…</h1>
            <p style={{ color: "var(--muted)" }}>
              Это занимает до минуты. Ссылка также придёт на вашу почту —
              страницу можно закрыть.
            </p>
          </>
        )}

        {status === "done" && (
          <>
            <h1>Презентация готова 🎉</h1>
            <p style={{ color: "var(--muted)" }}>
              Мы также отправили ссылку вам на почту.
            </p>
            {fileUrl && (
              <p>
                <a className="btn" href={fileUrl} style={{ display: "inline-block", width: "auto", textDecoration: "none" }}>
                  Скачать .pptx
                </a>
              </p>
            )}
          </>
        )}

        {status === "error" && (
          <>
            <h1>Что-то пошло не так</h1>
            <p style={{ color: "var(--muted)" }}>
              Не удалось сгенерировать презентацию. Напишите нам — поможем и
              вернём оплату.
            </p>
          </>
        )}

        {status === "unknown" && (
          <>
            <h1>Заказ не найден</h1>
            <p style={{ color: "var(--muted)" }}>
              Проверьте ссылку из письма.
            </p>
          </>
        )}

        <div className="footer">
          <a href="/">← на главную</a>
        </div>
      </div>
    </main>
  );
}
