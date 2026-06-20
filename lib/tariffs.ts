// Тарифы и стили — единый источник правды (используется и сервером, и клиентом).

export interface Tariff {
  id: "basic" | "standard" | "author";
  name: string;
  price: number; // рубли
  maxSlides: number;
  manual?: boolean;
  etaHours?: number;
}

export const TARIFFS: Record<Tariff["id"], Tariff> = {
  basic: { id: "basic", name: "Базовый", price: 299, maxSlides: 9 },
  standard: { id: "standard", name: "Стандарт", price: 499, maxSlides: 15 },
  author: {
    id: "author",
    name: "Авторская",
    price: 1399,
    maxSlides: 0,
    manual: true,
    etaHours: 48,
  },
};

export type StyleId = "business" | "creative" | "minimal";

export const STYLES: Record<StyleId, { label: string; hint: string }> = {
  business: { label: "Деловой", hint: "строгий, деловой, лаконичный" },
  creative: { label: "Креативный", hint: "яркий, креативный, образные формулировки" },
  minimal: { label: "Минимализм", hint: "минимализм, много воздуха, только суть" },
};

export const MIN_SLIDES = 3;
