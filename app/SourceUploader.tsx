"use client";

import { useEffect, useState } from "react";

export type SourceStatus = "empty" | "loading" | "ready" | "error";
export type SourcePhase = "upload" | "process";

export const MAX_SOURCE_SIZE = 25 * 1024 * 1024;

const BLAST_PHRASES = [
  "Читаем .docx",
  "Извлекаем картинки",
  "Распознаём схемы и графики",
  "Разбираем текст работы",
  "Почти готово",
];

// Полноэкранный лоадер на время загрузки/обработки исходной работы.
// Кольцо показывает реальный процент байтов (фаза upload), затем крутится
// «обработка». Исчезает, когда родитель меняет status с "loading".
export function BlastLoader({
  percent,
  phase,
  fileName,
}: {
  percent: number;
  phase: SourcePhase;
  fileName: string;
}) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (phase !== "process") return;
    const id = setInterval(
      () => setPhraseIndex((i) => (i + 1) % BLAST_PHRASES.length),
      1100
    );
    return () => clearInterval(id);
  }, [phase]);

  const label =
    phase === "upload" ? `Загружаем · ${percent}%` : BLAST_PHRASES[phraseIndex];

  return (
    <div
      className="blast"
      role="status"
      aria-live="polite"
      aria-label={`${label}`}
    >
      <div className={`blast-scene ${phase === "process" ? "is-process" : ""}`}>
        {/* документ-первоисточник */}
        <div className="doc">
          <div className="doc-fill" style={{ height: `${percent}%` }} />
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

        {/* колода слайдов, в которую он превращается */}
        <div className="deck">
          <span className="deck-slide ds1" />
          <span className="deck-slide ds2" />
          <span className="deck-slide ds3" />
        </div>

        {/* чипы-картинки, вылетающие из документа в слайды */}
        <span className="chip ch1" />
        <span className="chip ch2" />
        <span className="chip ch3" />
      </div>

      <div className="blast-text">
        <div className="blast-label">{label}</div>
        <div className="blast-file">{fileName}</div>
      </div>
    </div>
  );
}

export function SourceUploader({ uploadToken }: { uploadToken: string }) {
  const [status, setStatus] = useState<SourceStatus>("empty");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<SourcePhase>("upload");

  function onPick(file: File) {
    setError("");
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setStatus("error");
      setError("Нужен файл .docx (Word)");
      return;
    }
    if (file.size > MAX_SOURCE_SIZE) {
      setStatus("error");
      setError("Файл больше 25 МБ");
      return;
    }

    setStatus("loading");
    setFileName(file.name);
    setProgress(0);
    setPhase("upload");

    // XHR ради upload-progress — fetch его не отдаёт.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.upload.onload = () => {
      setProgress(100);
      setPhase("process"); // байты ушли, сервер парсит .docx
    };
    xhr.onload = () => {
      let data: { error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // тело без JSON (например прокси-ошибка) — упадём в общий error ниже
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        setStatus("ready");
      } else {
        setStatus("error");
        setError(data.error || "Не удалось загрузить файл");
      }
    };
    xhr.onerror = () => {
      setStatus("error");
      setError("Не удалось отправить файл. Проверьте интернет.");
    };

    const form = new FormData();
    form.append("uploadToken", uploadToken);
    form.append("kind", "source");
    form.append("file", file);
    xhr.send(form);
  }

  return (
    <div className="source-uploader">
      <label className="source-pick">
        <input
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          disabled={status === "loading"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
          }}
        />
        <span>{status === "ready" ? "Заменить файл" : "Выбрать файл .docx"}</span>
      </label>
      {status === "loading" && (
        <BlastLoader percent={progress} phase={phase} fileName={fileName} />
      )}
      {status === "ready" && (
        <div className="field-hint">✓ {fileName} — загружен</div>
      )}
      {status === "error" && <div className="field-hint error">{error}</div>}
    </div>
  );
}
