"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MIN_SLIDES, STYLES, StyleId, TARIFFS, Tariff } from "@/lib/tariffs";

const WISHES_MAX = 500;
const STORYBOARD_MAX = 1000;
const AUTHOR_EMAIL = "custom@slidemaker.ru";

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

const styleIcons: Record<StyleId, string> = {
  business: "🏢",
  creative: "🎨",
  minimal: "◻️",
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
  const [storyboard, setStoryboard] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [authorModalOpen, setAuthorModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  const tariff = TARIFFS[tariffId];
  const isAuthor = Boolean(tariff.manual);

  useEffect(() => {
    if (isAuthor) {
      setDetailsOpen(true);
      return;
    }
    setSlideCount((value) => Math.min(Math.max(value, MIN_SLIDES), tariff.maxSlides));
  }, [isAuthor, tariff.maxSlides]);

  const ctaText = useMemo(() => {
    if (isAuthor) return `Авторская презентация — ${tariff.price} ₽`;
    return `Оплатить ${tariff.price} ₽ →`;
  }, [isAuthor, tariff.price]);

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectTariff(id: Tariff["id"]) {
    if (TARIFFS[id].manual) {
      setAuthorModalOpen(true);
      return;
    }
    setTariffId(id);
    setError("");
  }

  function confirmAuthor() {
    setTariffId("author");
    setDetailsOpen(true);
    setAuthorModalOpen(false);
    setError("");
    window.setTimeout(scrollToForm, 0);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const cleanEmail = email.trim();
    const cleanTopic = topic.trim();
    const cleanWishes = wishes.trim();
    const cleanStoryboard = storyboard.trim();

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
        storyboard?: string;
      } = {
        email: cleanEmail,
        tariff: tariffId,
        topic: cleanTopic,
        style,
        wishes: cleanWishes,
        storyboard: cleanStoryboard,
      };
      if (!isAuthor) body.slideCount = slideCount;

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
          <div className="navbar-brand">⚡ Slidemaker</div>
          <div className="navbar-tagline">Презентации за минуту</div>
        </nav>

        <section className="hero">
          <div className="hero-badge">🤖 Генерация ИИ · 💳 Оплата ЮКассой</div>
          <h1>Презентация на любую тему — за минуту</h1>
          <p>
            Опишите тему, выберите стиль и количество слайдов. Готовый .pptx
            придёт на почту сразу после оплаты.
          </p>
          <button className="hero-cta" type="button" onClick={scrollToForm}>
            Заказать презентацию →
          </button>
          <div className="slide-preview" aria-hidden="true">
            <div className="slide-preview-bar" />
            <div className="slide-preview-title">Внедрение ИИ в ритейле 2024</div>
            <div className="slide-preview-lines">
              <span />
              <span />
              <span />
            </div>
            <div className="slide-preview-chart">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="slide-preview-label">↑ пример слайда из готовой презентации</div>
        </section>

        <section className="steps-section">
          <div className="container">
            <h2>Как это работает</h2>
            <div className="steps">
              <div className="step">
                <div className="step-num">1</div>
                <div className="step-body">
                  <strong>Опишите тему</strong>
                  <p>Укажите email, тему, выберите стиль и количество слайдов — это займёт 30 секунд.</p>
                </div>
              </div>
              <div className="step">
                <div className="step-num">2</div>
                <div className="step-body">
                  <strong>Оплатите картой</strong>
                  <p>Безопасный редирект на ЮКассу. Принимаем Visa, Mastercard, Мир, СБП.</p>
                </div>
              </div>
              <div className="step">
                <div className="step-num">3</div>
                <div className="step-body">
                  <strong>Получите .pptx на почту</strong>
                  <p>ИИ генерирует презентацию и отправляет файл на вашу почту — обычно в течение 3–5 минут.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="tariffs-section">
          <div className="container">
            <h2>Выберите тариф</h2>
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
        </section>

        <section className="form-section" ref={formRef}>
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
                <div className="spinner" />
              </div>
            ) : (
              <form className="card" onSubmit={handleSubmit}>
                {error && (
                  <div className="alert alert-error">
                    <span className="alert-icon">⚠️</span>
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
                  <div className="tariffs-ai form-tariffs-ai">
                    {(["basic", "standard"] as const).map((id) => (
                      <TariffCard
                        key={id}
                        tariff={TARIFFS[id]}
                        selected={tariffId === id}
                        compact
                        onSelect={() => selectTariff(id)}
                      />
                    ))}
                  </div>
                  <TariffCard
                    tariff={TARIFFS.author}
                    selected={tariffId === "author"}
                    compact
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

                {isAuthor && (
                  <div className="author-form-note visible">
                    ✍️ Авторский тариф — стиль и структуру определит дизайнер на основе вашей работы. Укажите пожелания ниже.
                  </div>
                )}

                <details
                  className="details-field"
                  open={detailsOpen}
                  onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
                >
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
                        placeholder="Например: хочу акцент на ROI и примеры из e-commerce, тон — уверенный, без воды. Целевая аудитория — топ-менеджеры. Дедлайн: 25 июня."
                        required={isAuthor}
                      />
                      <div className={counterClass(wishes.length, WISHES_MAX)}>
                        {wishes.length} / {WISHES_MAX}
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="storyboard">Сценарий по слайдам <span className="opt">(необязательно)</span></label>
                      <textarea
                        id="storyboard"
                        rows={3}
                        maxLength={STORYBOARD_MAX}
                        value={storyboard}
                        onChange={(e) => setStoryboard(e.target.value)}
                        placeholder={"Слайд 1: Проблема рынка\nСлайд 2: Наше решение\nСлайд 3: Результаты..."}
                      />
                      <div className={counterClass(storyboard.length, STORYBOARD_MAX)}>
                        {storyboard.length} / {STORYBOARD_MAX}
                      </div>
                      <div className="field-hint">Если указать заголовки слайдов — ИИ будет следовать вашей структуре.</div>
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
          <div className="footer-brand">⚡ slidemaker.ru</div>
          <div className="footer-links">
            <a href="#">Политика конфиденциальности</a>
            <a href="#">Оферта</a>
            <a href="#">Контакты</a>
          </div>
          <div className="footer-copy">© 2024 slidemaker.ru · Презентации ИИ и под ключ</div>
        </footer>
      </main>

      {authorModalOpen && (
        <div className="modal-overlay open" onMouseDown={() => setAuthorModalOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setAuthorModalOpen(false)} aria-label="Закрыть">
              ✕
            </button>
            <div className="modal-top-badge">✍️ Авторская · Под ключ</div>
            <h3>Как работает авторский тариф</h3>
            <div className="modal-sub">
              Живой дизайнер создаёт презентацию на основе ваших материалов. Не шаблон — ваши реальные данные.
            </div>
            <div className="modal-checklist">
              <div className="modal-check-item">
                <div className="modal-check-icon">📄</div>
                <div className="modal-check-body">
                  <strong>Ваша работа (ВКР / диплом / диссертация)</strong>
                  <p>Пришлёте файл после оплаты на <strong>{AUTHOR_EMAIL}</strong> — это основа для слайдов.</p>
                </div>
              </div>
              <div className="modal-check-item">
                <div className="modal-check-icon">💬</div>
                <div className="modal-check-body">
                  <strong>Пожелания и дедлайн</strong>
                  <p>Укажите акценты и желаемый срок в поле «Пожелания». Дизайнер свяжется при необходимости.</p>
                </div>
              </div>
              <div className="modal-check-item">
                <div className="modal-check-icon">🎨</div>
                <div className="modal-check-body">
                  <strong>Результат за {TARIFFS.author.etaHours} часов</strong>
                  <p>Готовая .pptx-презентация с реальными данными из вашей работы. Одна правка включена.</p>
                </div>
              </div>
            </div>
            <div className="modal-email-hint">
              После оплаты пришлите файл работы на <code>{AUTHOR_EMAIL}</code> — дизайнер начнёт сразу.
            </div>
            <button className="btn btn-amber" type="button" onClick={confirmAuthor}>
              Понятно, продолжить →
            </button>
            <button className="modal-cancel" type="button" onClick={() => setAuthorModalOpen(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </>
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

  return (
    <button
      className={`tariff-card ${selected ? "active" : ""} ${isAuthor ? "author" : ""} ${compact ? "compact" : ""}`}
      type="button"
      onClick={onSelect}
    >
      {isAuthor ? (
        <div className="tariff-author-row">
          <div className="tariff-badge">Авторская</div>
          <div className="tariff-human-badge">✍️ Под ключ</div>
        </div>
      ) : (
        <div className="tariff-badge">
          {tariff.name}
          {tariff.id === "standard" && <span className="tariff-popular">Популярный</span>}
        </div>
      )}
      <div className="tariff-price">
        <sup>₽</sup>
        {tariff.price}
      </div>
      <div className="tariff-slides">
        {isAuthor ? `живой дизайнер · ${tariff.etaHours}ч · 1 правка` : `до ${tariff.maxSlides} слайдов`}
      </div>
      {!compact && (
        <>
          {isAuthor && (
            <div className="tariff-author-desc">
              Для ВКР, диплома, диссертации — живой дизайнер, ваши реальные данные
            </div>
          )}
          <ul className="tariff-features">
            {tariffFeatures[tariff.id].map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </>
      )}
    </button>
  );
}
