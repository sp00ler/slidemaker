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
      <body>{children}</body>
    </html>
  );
}
