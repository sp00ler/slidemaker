import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE = process.env.APP_URL || "https://slidemaker.ru";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "SlideMaker — презентации с ИИ за минуту · готовый .pptx на почту",
    template: "%s · SlideMaker",
  },
  description:
    "Создание презентаций онлайн с ИИ: введите тему — получите готовый файл .pptx PowerPoint на почту за минуты. Можно собрать из готовой работы .docx. Для учёбы, работы и бизнеса. От 299 ₽, оплата ЮKassa.",
  applicationName: "SlideMaker",
  keywords: [
    "презентация онлайн",
    "сделать презентацию",
    "генератор презентаций",
    "презентация с ИИ",
    "нейросеть для презентаций",
    "заказать презентацию",
    "презентация pptx",
    "презентация powerpoint",
    "презентация из docx",
    "презентация для диплома",
    "презентация под ключ",
    "создать презентацию по теме",
  ],
  authors: [{ name: "SlideMaker" }],
  creator: "SlideMaker",
  publisher: "SlideMaker",
  alternates: { canonical: SITE },
  category: "technology",
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: SITE,
    siteName: "SlideMaker",
    title: "SlideMaker — презентации с ИИ за минуту",
    description:
      "Введите тему — получите готовую презентацию .pptx на почту за минуты. Или соберите из своей работы .docx. От 299 ₽.",
  },
  twitter: {
    card: "summary_large_image",
    title: "SlideMaker — презентации с ИИ за минуту",
    description:
      "Готовый .pptx на почту за минуты. ИИ или живой дизайнер. От 299 ₽, оплата ЮKassa.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1E4DD8",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: SITE,
      name: "SlideMaker",
      inLanguage: "ru-RU",
      description:
        "Генерация презентаций .pptx с ИИ по теме или из готовой работы .docx.",
    },
    {
      "@type": "Organization",
      "@id": `${SITE}/#org`,
      name: "SlideMaker",
      url: SITE,
      logo: `${SITE}/icon.svg`,
    },
    {
      "@type": "Service",
      "@id": `${SITE}/#service`,
      name: "Создание презентаций с ИИ",
      serviceType: "Генерация презентаций .pptx",
      provider: { "@id": `${SITE}/#org` },
      areaServed: "RU",
      inLanguage: "ru-RU",
      description:
        "Введите тему — ИИ соберёт структуру, текст и оформление и пришлёт готовый файл .pptx на почту. Можно собрать презентацию из готовой работы .docx или заказать у живого дизайнера.",
      offers: {
        "@type": "Offer",
        price: "299",
        priceCurrency: "RUB",
        availability: "https://schema.org/InStock",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Inter:opsz,wght@14..32,300..900&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
