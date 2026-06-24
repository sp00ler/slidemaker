"use client";

import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MIN_SLIDES, STYLES, StyleId, TARIFFS, Tariff } from "@/lib/tariffs";
import { SourceUploader } from "./SourceUploader";
import { BlastScene } from "./BlastScene";

const WISHES_MAX = 2000;
const AUTHOR_EMAIL = "custom@slidemaker.ru";
const MAX_UPLOAD_SLIDES = 15;
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME = ["image/png", "image/jpeg", "image/webp"] as const;

type UploadStatus =
  | "empty"
  | "loading"
  | "ready"
  | "text-only"
  | "error-size"
  | "error-type";

type UploadSlotState = {
  status: UploadStatus;
  description: string;
  error?: string;
  fileName?: string;
  fileSize?: string;
  previewUrl?: string;
};

function createEmptySlot(): UploadSlotState {
  return { status: "empty", description: "" };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function validateClientUpload(
  file: File
): { ok: true } | { ok: false; status: "error-size" | "error-type"; error: string } {
  if (file.size > MAX_UPLOAD_SIZE) {
    return { ok: false, status: "error-size", error: "Файл больше 5 МБ" };
  }
  if (!ALLOWED_UPLOAD_MIME.includes(file.type as (typeof ALLOWED_UPLOAD_MIME)[number])) {
    return { ok: false, status: "error-type", error: "Только PNG, JPEG или WebP" };
  }
  return { ok: true };
}

const tariffFeatures: Record<Tariff["id"], string[]> = {
  basic: [
    "Введение + 5–7 смысловых слайдов",
    "Один стиль на выбор",
    "Структура и текст ИИ",
    "Файл .pptx на почту",
  ],
  standard: [
    "Введение + 11–13 подробных слайдов",
    "Один стиль на выбор",
    "Детальная структура от ИИ",
    "Файл .pptx на почту",
  ],
  author: [
    "Живой дизайнер, не ИИ",
    "Реальные данные из вашей работы",
    `Готово за ${TARIFFS.author.etaHours} часов`,
    "Одна правка включена",
  ],
};

const styleIcons: Record<StyleId, JSX.Element> = {
  business: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 7h2M9 11h2M9 15h2M14 7h1M14 11h1M14 15h1" />
    </svg>
  ),
  creative: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.3 6.3l2 2M15.7 15.7l2 2M17.7 6.3l-2 2M8.3 15.7l-2 2" />
    </svg>
  ),
  minimal: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 12h6" />
    </svg>
  ),
};

const styleDescriptions: Record<StyleId, string> = {
  business: "строгий, лаконичный",
  creative: "яркий, образный",
  minimal: "воздух, только суть",
};

const faqs = [
  {
    q: "Как быстро придёт презентация?",
    a: `ИИ-тарифы: обычно 3–5 минут после оплаты, в редких случаях до 15 минут. Авторская: до ${TARIFFS.author.etaHours} часов после получения вашего файла. Если письмо не пришло — проверьте папку «Спам».`,
  },
  {
    q: "Сколько времени доступен файл?",
    a: "Ссылка в письме активна 7 дней — успейте скачать в течение недели. Сохраните файл сразу после получения.",
  },
  {
    q: "Можно ли редактировать готовую презентацию?",
    a: "Да, вы получаете обычный .pptx-файл. Его можно открыть и редактировать в PowerPoint, Keynote, Google Slides или LibreOffice.",
  },
  {
    q: "Что если результат мне не понравится?",
    a: "Для ИИ-тарифов качество зависит от детальности описания — чем подробнее запрос, тем точнее результат. Используйте поле «Пожелания» для уточнений. Авторский тариф включает одну правку после получения.",
  },
  {
    q: "Какие способы оплаты доступны?",
    a: "Оплата через ЮКассу: банковская карта (Visa, Mastercard, Мир), СБП, ЮMoney.",
  },
];

function counterClass(length: number, max: number): string {
  if (length >= max) return "char-counter full";
  if (length >= max * 0.8) return "char-counter warn";
  return "char-counter";
}

export default function Home() {
  const [tariffId, setTariffId] = useState<Tariff["id"]>("standard");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(8);
  const [style, setStyle] = useState<StyleId>("business");
  const [wishes, setWishes] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");
  const [uploadToken, setUploadToken] = useState("");
  const [slots, setSlots] = useState<UploadSlotState[]>(
    () => Array.from({ length: MAX_UPLOAD_SLIDES }, createEmptySlot)
  );
  const [unlockedSlide, setUnlockedSlide] = useState(1);
  const formRef = useRef<HTMLDivElement>(null);
  const slotsRef = useRef(slots);

  const tariff = TARIFFS[tariffId];
  const isAuthor = Boolean(tariff.manual);

  useEffect(() => {
    setUploadToken(globalThis.crypto.randomUUID());
  }, []);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    return () => {
      slotsRef.current.forEach((slot) => {
        if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
      });
    };
  }, []);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".reveal, .reveal-stagger"));
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const deck = document.getElementById("hero-deck");
    const wrap = deck?.parentElement;
    if (!deck || !wrap) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const mobile = window.matchMedia("(max-width:980px)").matches;
    const base = mobile ? "translateX(-50%) " : "";
    let raf = 0;
    deck.style.transform = `${base}rotateY(-8deg) rotateX(3deg)`;

    function onMove(e: PointerEvent) {
      const r = wrap!.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        deck!.style.transform = `${base}rotateY(${-x * 10}deg) rotateX(${y * 8}deg)`;
      });
    }
    function onLeave() {
      deck!.style.transform = `${base}rotateY(-8deg) rotateX(3deg)`;
    }
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  useEffect(() => {
    if (isAuthor) {
      setDetailsOpen(true);
      return;
    }
    setSlideCount((value) => Math.min(Math.max(value, MIN_SLIDES), tariff.maxSlides));
  }, [isAuthor, tariff.maxSlides]);

  useEffect(() => {
    if (isAuthor) return;
    setUnlockedSlide((value) => Math.min(Math.max(value, 1), slideCount));
  }, [isAuthor, slideCount]);

  const ctaText = useMemo(() => {
    if (isAuthor) return `Авторская презентация — ${tariff.price} ₽`;
    return `Оплатить ${tariff.price} ₽ →`;
  }, [isAuthor, tariff.price]);

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectTariff(id: Tariff["id"]) {
    setTariffId(id);
    setError("");
    if (TARIFFS[id].manual) {
      setDetailsOpen(true);
      window.setTimeout(scrollToForm, 0);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const cleanEmail = email.trim();
    const cleanTopic = topic.trim();
    const cleanWishes = wishes.trim();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      setError("Введите корректный email");
      return;
    }
    if (cleanTopic.length < 3) {
      setError("Опишите тему презентации");
      return;
    }
    if (isAuthor && !cleanWishes) {
      setError("Опишите задачу для авторской презентации");
      setDetailsOpen(true);
      return;
    }

    setLoading(true);
    try {
      const body: {
        email: string;
        tariff: Tariff["id"];
        topic: string;
        style: StyleId;
        slideCount?: number;
        wishes?: string;
        uploadToken?: string;
      } = {
        email: cleanEmail,
        tariff: tariffId,
        topic: cleanTopic,
        style,
        wishes: cleanWishes,
      };
      if (!isAuthor) body.slideCount = slideCount;
      if (!isAuthor && uploadToken) body.uploadToken = uploadToken;

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { confirmationUrl?: string; error?: string };
      if (!res.ok || !data.confirmationUrl) {
        setError(data.error || "Не удалось создать заказ");
        setLoading(false);
        return;
      }

      setRedirecting(true);
      window.location.href = data.confirmationUrl;
    } catch {
      setError("Не удалось подключиться. Проверьте интернет и попробуйте ещё раз.");
      setLoading(false);
    }
  }

  return (
    <>
      <main>
        <nav className="navbar">
          <div className="navbar-brand">Slide<span>maker</span></div>
          <div className="navbar-tagline">Презентации за минуту</div>
        </nav>

        <section className="hero">
          <div className="hero-rule" />
          <div className="hero-meta">
            <span>ИИ-презентации для бизнеса, учёбы и техники · .pptx</span>
            <span className="em">Готово сегодня · 3–5 минут</span>
          </div>
          <div className="hero-inner">
            <div className="hero-text">
              <h1>
                <span>Слайды</span>
                <br />
                <span className="out">на любую</span>
                <br />
                <span>тему.</span> <span className="hero-accent">за минуту</span>
              </h1>
              <p>
                Бизнес, учёба, техника, наука — опишите тему, и ИИ соберёт структуру,
                заголовки и графику. <b>Готовый .pptx</b> придёт на почту. Правьте в
                PowerPoint, если надо.
              </p>
              <div className="hero-cta-row">
                <button className="hero-cta" type="button" onClick={scrollToForm}>
                  Собрать презентацию →
                </button>
                <span className="hero-price">от {TARIFFS.basic.price} ₽</span>
              </div>
              <div className="chips" style={{ marginTop: "26px" }}>
                <span className="chip"><b>3–5 минут</b> до файла</span>
                <span className="chip">Формат <b>.pptx</b></span>
                <span className="chip">ЮKassa · МИР</span>
                <span className="chip amber"><b>2 генерации</b> за оплату</span>
              </div>
            </div>

            <div className="deckwrap">
              <div className="deck" id="hero-deck" aria-label="Реальные слайды из готовых презентаций">
                <div className="scard back2"><img src="/examples/1.png" alt="" /></div>
                <div className="scard back1"><img src="/examples/3.png" alt="" /></div>
                <div className="scard front">
                  <div className="deck-badge">2 генерации</div>
                  <img src="/examples/2.png" alt="Пример слайда: техническая архитектура виртуального стенда" />
                </div>
              </div>
              <div className="deck-cap">Наведи — слайд оживает · <em>реальный результат</em></div>
            </div>
          </div>
        </section>

        <div className="ticker" aria-hidden="true">
          <div className="ticker-track">
            <span>Бизнес-аналитика</span><span>Техническая архитектура</span><span>Защита диплома</span><span>Научный доклад</span><span>Питч стартапа</span><span>Квартальный отчёт</span>
            <span>Бизнес-аналитика</span><span>Техническая архитектура</span><span>Защита диплома</span><span>Научный доклад</span><span>Питч стартапа</span><span>Квартальный отчёт</span>
          </div>
        </div>

        <section className="examples-section reveal">
          <div className="container">
            <div className="ex-head">
              <h2 className="poster">Реальные слайды,<br /><span className="out">не заглушки.</span></h2>
              <p>Пять задач — бизнес, техника, наука, учёба. Показываем диапазон, а не количество. <span className="idx">01—05</span></p>
            </div>

            {[
              { n: "01", cat: "Бизнес", img: "/examples/3.png", t1: "Бизнес-", t2: "аналитика", alt: "Предпосылки автоматизации: экономика проблемы", desc: "Данные и экономический аргумент как история — слайд продаёт идею, а не просто показывает цифры." },
              { n: "02", cat: "Техника", img: "/examples/1.png", t1: "Техническая", t2: "архитектура", alt: "Архитектура и логика работы AI-ассистента", desc: "Сложная схема и логика системы — структурно и читаемо, без визуального хаоса." },
              { n: "03", cat: "Инфраструктура", img: "/examples/2.png", t1: "Инфра-", t2: "структурные схемы", alt: "Архитектура виртуального стенда", desc: "Чистая визуализация инфраструктуры — узлы и связи понятны с первого взгляда." },
              { n: "04", cat: "Наука · учёба", img: "/examples/4.png", t1: "Учебные и", t2: "научные темы", alt: "Что такое механочувствительность", desc: "Научное понятие объяснено просто — для лекции, урока и защиты диплома." },
              { n: "05", cat: "Фото + текст", img: "/examples/5.png", t1: "Фото и", t2: "структура", alt: "Обслуживание и заключение по жёстким дискам", desc: "Фотографии и структурированный текст на одном слайде — наглядно и по делу." },
            ].map((ex) => (
              <div className="ex-row" key={ex.n}>
                <div className="ex-meta">
                  <div className="row-idx"><span className="n">{ex.n}</span><span className="cat">{ex.cat}</span></div>
                  <h3>{ex.t1}<br /><span className="out">{ex.t2}</span></h3>
                  <p>{ex.desc}</p>
                </div>
                <div className="ex-media">
                  <div className="frame"><img src={ex.img} alt={ex.alt} loading="lazy" /></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="steps-v3-section reveal">
          <div className="container">
            <h2 className="steps-v3-heading">Как это работает</h2>
            <div className="steps-v3 reveal-stagger">

              <div className="step-v3">
                <div className="step-v3-left">
                  <div className="step-v3-num" aria-hidden="true">1</div>
                  <div className="step-v3-connector" aria-hidden="true" />
                </div>
                <div className="step-v3-body">
                  <div className="step-v3-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </div>
                  <strong className="step-v3-title">Опишите тему</strong>
                  <p className="step-v3-desc">Укажите email, тему, выберите стиль и количество слайдов — займёт 30 секунд.</p>
                </div>
              </div>

              <div className="step-v3">
                <div className="step-v3-left">
                  <div className="step-v3-num" aria-hidden="true">2</div>
                  <div className="step-v3-connector" aria-hidden="true" />
                </div>
                <div className="step-v3-body">
                  <div className="step-v3-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <path d="M2 10h20" />
                    </svg>
                  </div>
                  <strong className="step-v3-title">Оплатите картой</strong>
                  <p className="step-v3-desc">Безопасный редирект на ЮКассу. Принимаем Visa, Mastercard, Мир, СБП.</p>
                </div>
              </div>

              <div className="step-v3">
                <div className="step-v3-left">
                  <div className="step-v3-num" aria-hidden="true">3</div>
                  {/* no connector on last step */}
                </div>
                <div className="step-v3-body">
                  <div className="step-v3-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </div>
                  <strong className="step-v3-title">Получите .pptx на почту</strong>
                  <p className="step-v3-desc">ИИ генерирует презентацию и отправляет файл — обычно 3–5 минут.</p>
                </div>
              </div>

            </div>
          </div>
        </section>


        <section className="form-section reveal" ref={formRef}>
          <div className="container">
            <h2>Оформить заказ</h2>
            {redirecting ? (
              <div className="payment-redirect">
                <div className="bank-logo">
                  <div className="bank-icon">ЮК</div>
                  ЮКасса · безопасный платёж
                </div>
                <div className="payment-amount">{tariff.price} ₽</div>
                <h3>Переходим к оплате</h3>
                <p>Не закрывайте вкладку, сейчас откроется страница ЮКассы.</p>
                <BlastScene processing />
              </div>
            ) : (
              <form className="card" onSubmit={handleSubmit}>
                {error && (
                  <div className="alert alert-error">
                    <span className="alert-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <path d="M12 9v4M12 17h.01" />
                      </svg>
                    </span>
                    <div>{error}</div>
                  </div>
                )}

                <div className="field">
                  <label htmlFor="email">Email <span className="required">*</span></label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="вы@example.com"
                    required
                  />
                  <div className="field-hint">Пришлём .pptx сразу после оплаты</div>
                </div>

                <div className="field">
                  <label htmlFor="topic">Тема презентации <span className="required">*</span></label>
                  <input
                    id="topic"
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Например: Внедрение ИИ в розничной торговле"
                    maxLength={300}
                    required
                  />
                  <div className="field-hint">Чем конкретнее — тем точнее результат. До 300 символов.</div>
                </div>

                <div className="field">
                  <label>Тариф</label>
                  <div className="tariffs-ai">
                    {(["basic", "standard"] as const).map((id) => (
                      <TariffCard
                        key={id}
                        tariff={TARIFFS[id]}
                        selected={tariffId === id}
                        compact={false}
                        onSelect={() => selectTariff(id)}
                      />
                    ))}
                  </div>
                  <div className="tariff-divider">или закажите у живого дизайнера</div>
                  <TariffCard
                    tariff={TARIFFS.author}
                    selected={tariffId === "author"}
                    compact={false}
                    onSelect={() => selectTariff("author")}
                  />
                </div>

                {!isAuthor && (
                  <>
                    <div className="field">
                      <label htmlFor="slides">
                        Количество слайдов: <span className="slider-val">{slideCount}</span>
                      </label>
                      <div className="slider-row">
                        <span>{MIN_SLIDES}</span>
                        <input
                          id="slides"
                          type="range"
                          min={MIN_SLIDES}
                          max={tariff.maxSlides}
                          value={slideCount}
                          onChange={(e) => setSlideCount(Number(e.target.value))}
                        />
                        <span>{tariff.maxSlides}</span>
                      </div>
                      <div className="field-hint">Лимит тарифа «{tariff.name}» — до {tariff.maxSlides} слайдов</div>
                    </div>

                    <div className="field">
                      <label>Стиль оформления</label>
                      <div className="styles">
                        {(Object.keys(STYLES) as StyleId[]).map((id) => (
                          <button
                            key={id}
                            className={`style-opt ${style === id ? "active" : ""}`}
                            type="button"
                            onClick={() => setStyle(id)}
                          >
                            <div className="style-icon">{styleIcons[id]}</div>
                            <div className="style-label">{STYLES[id].label}</div>
                            <div className="style-desc">{styleDescriptions[id]}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {!isAuthor && uploadToken && (
                  <details className="details-field">
                    <summary>
                      + Собрать из готовой работы .docx (необязательно)
                      <span>▼</span>
                    </summary>
                    <div className="disclosure-body">
                      <div className="disclosure-hint">
                        Загрузите готовую работу (.docx) — реферат, диплом, статью.
                        ИИ возьмёт её текст за основу и подберёт из неё подходящие
                        картинки, графики и схемы для слайдов.
                      </div>
                      <SourceUploader uploadToken={uploadToken} />
                    </div>
                  </details>
                )}

                {!isAuthor && uploadToken && (
                  <details className="details-field">
                    <summary>
                      + Добавить свои картинки к слайдам (необязательно)
                      <span>▼</span>
                    </summary>
                    <div className="disclosure-body">
                      <SlideUploader
                        slideCount={slideCount}
                        uploadToken={uploadToken}
                        slots={slots}
                        setSlots={setSlots}
                        unlockedSlide={unlockedSlide}
                        setUnlockedSlide={setUnlockedSlide}
                      />
                    </div>
                  </details>
                )}

                {isAuthor && (
                  <div className="author-form-note visible">
                    <strong>Как работает авторский тариф:</strong>
                    <ul style={{ margin: "8px 0 0", paddingLeft: "18px", fontSize: "13px", display: "flex", flexDirection: "column", gap: "4px" }}>
                      <li>Живой дизайнер разработает презентацию по вашим материалам (диплом, ВКР, статья).</li>
                      <li>После оплаты пришлите файлы работы на почту <code>{AUTHOR_EMAIL}</code>.</li>
                      <li>Срок выполнения — до {TARIFFS.author.etaHours} часов. Одна правка включена.</li>
                    </ul>
                  </div>
                )}

                <details className="details-field" open={detailsOpen} onToggle={(e) => setDetailsOpen(e.currentTarget.open)}>
                  <summary>
                    {detailsOpen ? "− Скрыть подробные пожелания" : "+ Добавить подробные пожелания"}
                    <span>▼</span>
                  </summary>
                  <div className="disclosure-body">
                    <div className="disclosure-hint">
                      {isAuthor
                        ? "Укажите пожелания и дедлайн — дизайнер опирается на них."
                        : "Необязательно — но чем подробнее запрос, тем точнее результат. Можно оставить одно или оба поля пустыми."}
                    </div>
                    <div className="field">
                      <label htmlFor="wishes">
                        Пожелания и видение{" "}
                        {!isAuthor && <span className="opt">(необязательно)</span>}
                        {isAuthor && <span className="required">*</span>}
                      </label>
                      <textarea
                        id="wishes"
                        rows={3}
                        maxLength={WISHES_MAX}
                        value={wishes}
                        onChange={(e) => setWishes(e.target.value)}
                        placeholder="Например: хочу акцент на ROI и примеры из e-commerce, тон — уверенный, без воды. Целевая аудитория — топ-менеджеры. Можно расписать по слайдам — что на каком должно быть."
                        required={isAuthor}
                      />
                      <div className={counterClass(wishes.length, WISHES_MAX)}>
                        {wishes.length} / {WISHES_MAX}
                      </div>
                    </div>
                  </div>
                </details>

                <button className={`btn ${isAuthor ? "btn-amber" : ""}`} type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="btn-spinner" />
                      Создаём заказ…
                    </>
                  ) : (
                    ctaText
                  )}
                </button>
                <div className="secure-note">Безопасная оплата через ЮКассу · Файл придёт на email</div>
              </form>
            )}
          </div>
        </section>

        <section className="faq-section">
          <div className="container">
            <h2>Частые вопросы</h2>
            {faqs.map((faq) => (
              <details className="faq-item" key={faq.q}>
                <summary className="faq-q">
                  {faq.q}
                  <span className="faq-arrow">▼</span>
                </summary>
                <div className="faq-a">{faq.a}</div>
              </details>
            ))}
          </div>
        </section>

        <footer className="footer">
          <div className="footer-brand">slidemaker.ru</div>
          <div className="footer-links">
            <a href="#">Политика конфиденциальности</a>
            <a href="#">Оферта</a>
            <a href="#">Контакты</a>
          </div>
          <div className="footer-copy">© 2025 slidemaker.ru · Презентации ИИ и под ключ</div>
        </footer>
        <div className="sticky-cta">
          <button className="btn-primary" type="button" onClick={scrollToForm}>
            Заказать презентацию — {tariff.price} ₽
          </button>
        </div>
      </main>


    </>
  );
}

function SlideUploader({
  slideCount,
  uploadToken,
  slots,
  setSlots,
  unlockedSlide,
  setUnlockedSlide,
}: {
  slideCount: number;
  uploadToken: string;
  slots: UploadSlotState[];
  setSlots: Dispatch<SetStateAction<UploadSlotState[]>>;
  unlockedSlide: number;
  setUnlockedSlide: Dispatch<SetStateAction<number>>;
}) {
  const visibleCount = slideCount;

  function updateSlot(slotNumber: number, next: UploadSlotState) {
    setSlots((current) => {
      const copy = [...current];
      const previous = copy[slotNumber - 1];
      if (previous?.previewUrl && previous.previewUrl !== next.previewUrl) {
        URL.revokeObjectURL(previous.previewUrl);
      }
      copy[slotNumber - 1] = next;
      return copy;
    });
  }

  function unlockNext(slotNumber: number) {
    setUnlockedSlide((value) => Math.min(slideCount, Math.max(value, slotNumber + 1)));
  }

  function removeSlot(slotNumber: number) {
    updateSlot(slotNumber, createEmptySlot());
  }

  function skipSlot(slotNumber: number) {
    const previous = slots[slotNumber - 1];
    updateSlot(slotNumber, { status: "text-only", description: previous?.description ?? "" });
    unlockNext(slotNumber);
  }

  async function uploadSlotFile(slotNumber: number, file: File, description: string) {
    const validation = validateClientUpload(file);
    if (!validation.ok) {
      updateSlot(slotNumber, {
        status: validation.status,
        description,
        error: validation.error,
      });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    updateSlot(slotNumber, {
      status: "loading",
      description,
      fileName: file.name,
      fileSize: formatFileSize(file.size),
      previewUrl,
    });

    try {
      const form = new FormData();
      form.append("uploadToken", uploadToken);
      form.append("slideNumber", String(slotNumber));
      form.append("file", file);
      form.append("description", description);

      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const message = data.error || "Не удалось загрузить файл";
        updateSlot(slotNumber, {
          status: message.includes("5 МБ") ? "error-size" : "error-type",
          description,
          error: message,
          fileName: file.name,
          fileSize: formatFileSize(file.size),
          previewUrl,
        });
        return;
      }

      updateSlot(slotNumber, {
        status: "ready",
        description,
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        previewUrl,
      });
      unlockNext(slotNumber);
    } catch {
      updateSlot(slotNumber, {
        status: "error-type",
        description,
        error: "Не удалось отправить файл. Проверьте интернет.",
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        previewUrl,
      });
    }
  }

  return (
    <div className="uploader" id="uploader-section">
      <div className="uploader-head">
        <div>
          <div className="uploader-kicker">Картинки по слайдам</div>
          <div className="uploader-title">Загрузите файлы под нужные слайды</div>
        </div>
        <div className="uploader-meta">{visibleCount} / {slideCount}</div>
      </div>
      <div className="uploader-list">
        {Array.from({ length: visibleCount }, (_, index) => {
          const slotNumber = index + 1;
          return (
            <UploadSlot
              key={slotNumber}
              slotNumber={slotNumber}
              slot={slots[slotNumber - 1]}
              onUpload={uploadSlotFile}
              onRemove={removeSlot}
              onSkip={skipSlot}
              onDescriptionChange={(value) => {
                setSlots((current) => {
                  const copy = [...current];
                  copy[slotNumber - 1] = {
                    ...(copy[slotNumber - 1] ?? createEmptySlot()),
                    description: value,
                  };
                  return copy;
                });
              }}
            />
          );
        })}
      </div>
      <div className="uploader-foot">PNG, JPEG, WebP · до 5 МБ · один файл на слайд</div>
    </div>
  );
}

function UploadSlot({
  slotNumber,
  slot,
  onUpload,
  onRemove,
  onSkip,
  onDescriptionChange,
}: {
  slotNumber: number;
  slot: UploadSlotState;
  onUpload: (slotNumber: number, file: File, description: string) => Promise<void>;
  onRemove: (slotNumber: number) => void;
  onSkip: (slotNumber: number) => void;
  onDescriptionChange: (value: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  function pickFile(file: File | undefined) {
    if (!file || slot.status === "loading") return;
    void onUpload(slotNumber, file, slot.description);
  }

  return (
    <div className={`slide-slot ${slot.status} ${dragOver ? "drag-over" : ""}`}>
      <div className="slide-slot-head">
        <div className="slide-slot-badge">{slotNumber}</div>
        <div>
          <div className="slide-slot-title">Слайд {slotNumber}</div>
          <div className="slide-slot-sub">
            {slot.status === "text-only"
              ? "Только текст"
              : slot.status === "ready"
                ? "Готово"
                : slot.status === "loading"
                  ? "Загрузка"
                  : "Пусто"}
          </div>
        </div>
        {(slot.status === "empty" || slot.status === "error-size" || slot.status === "error-type") && (
          <button className="slide-slot-skip" type="button" onClick={() => onSkip(slotNumber)}>
            пропустить
          </button>
        )}
      </div>

      <div
        className="slide-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFile(e.dataTransfer.files?.[0]);
        }}
      >
        {slot.status === "loading" ? (
          <div className="slide-loading">
            <span className="btn-spinner" />
            <span>{slot.fileName}</span>
          </div>
        ) : slot.status === "ready" || slot.status === "error-size" || slot.status === "error-type" ? (
          <div className="slide-ready">
            {slot.previewUrl && <img src={slot.previewUrl} alt="" className="slide-thumb" />}
            <div className="slide-ready-meta">
              <strong>{slot.fileName}</strong>
              <span>{slot.fileSize}</span>
              {slot.error && <span className="slide-error">{slot.error}</span>}
            </div>
            <div className="slide-actions">
              <label className="slide-action">
                заменить
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => pickFile(e.target.files?.[0])}
                />
              </label>
              <button className="slide-action danger" type="button" onClick={() => onRemove(slotNumber)}>
                удалить
              </button>
            </div>
          </div>
        ) : slot.status === "text-only" ? (
          <div className="slide-text-only">
            <span aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M9 13h6M9 17h4" />
              </svg>
            </span>
            <span>Без изображения</span>
            <label className="slide-action">
              добавить фото
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </label>
          </div>
        ) : (
          <label className="slide-empty">
            <span className="slide-empty-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </span>
            <span className="slide-empty-title">Перетащите файл или выберите</span>
            <span className="slide-empty-hint">PNG, JPEG, WebP · до 5 МБ</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </label>
        )}
      </div>

      <div className="slide-desc">
        <textarea
          rows={2}
          maxLength={200}
          placeholder="Коротко опишите, что должно быть на слайде"
          value={slot.description}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
        <div className="slide-desc-row">
          <span>{slot.description.length} / 200</span>
          <span>{slot.status === "ready" || slot.status === "text-only" ? "слайд заполнен" : ""}</span>
        </div>
      </div>
    </div>
  );
}

function TariffCard({
  tariff,
  selected,
  compact,
  onSelect,
}: {
  tariff: Tariff;
  selected: boolean;
  compact: boolean;
  onSelect: () => void;
}) {
  const isAuthor = Boolean(tariff.manual);
  const isStandard = tariff.id === "standard";

  return (
    <div className="tariff-v3-wrapper">
      {isStandard && (
        <div className="tariff-v3-popular-pill" aria-label="Популярный тариф">
          Популярный
        </div>
      )}
      <button
        className={[
          "tariff-v3-card",
          isAuthor ? "tariff-v3-card--author" : "",
          isStandard ? "tariff-v3-card--standard" : "",
          selected ? "tariff-v3-card--selected" : "",
          compact ? "tariff-v3-card--compact" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        type="button"
        onClick={onSelect}
      >
        {/* Header row */}
        <div className="tariff-v3-head">
          {isAuthor ? (
            <div className="tariff-v3-name-row">
              <span className="tariff-v3-name tariff-v3-name--amber">Авторская</span>
              <span className="tariff-v3-human-pill">Под ключ</span>
            </div>
          ) : (
            <span className="tariff-v3-name">{tariff.name}</span>
          )}
        </div>

        {/* Price */}
        <div className="tariff-v3-price">
          <span className="tariff-v3-price-currency">₽</span>
          <span className="tariff-v3-price-amount">{tariff.price}</span>
        </div>

        {/* Subtitle */}
        <div className="tariff-v3-subtitle">
          {isAuthor
            ? `живой дизайнер · ${tariff.etaHours}ч · 1 правка`
            : `до ${tariff.maxSlides} слайдов`}
        </div>

        {/* Features — only in non-compact mode */}
        {!compact && (
          <>
            {isAuthor && (
              <p className="tariff-v3-author-desc">
                Для ВКР, диплома, диссертации — живой дизайнер, ваши реальные данные
              </p>
            )}
            <ul className="tariff-v3-features">
              {tariffFeatures[tariff.id].map((feature) => (
                <li key={feature} className="tariff-v3-feature">
                  <svg
                    className="tariff-v3-check"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Selected checkmark badge (top-right corner) */}
        {selected && (
          <div className="tariff-v3-selected-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </button>
    </div>
  );
}
