import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SlideMaker — генерация презентаций за минуту",
  description:
    "Введите тему — получите готовую презентацию .pptx на почту. От 299 ₽.",
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
