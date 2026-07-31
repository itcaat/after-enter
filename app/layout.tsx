import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["cyrillic", "latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["cyrillic", "latin"], weight: ["400", "500", "600"] });
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://inside-networking-simulator.go-travel-un-5603.chatgpt.site/";
const siteUrl = new URL(configuredSiteUrl.endsWith("/") ? configuredSiteUrl : `${configuredSiteUrl}/`);

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "Что происходит после нажатия Enter?",
  description: "Интерактивная симуляция пути веб-запроса — от URL до пикселей.",
  icons: {
    icon: new URL("favicon.svg", siteUrl),
    shortcut: new URL("favicon.svg", siteUrl),
  },
  openGraph: {
    title: "Что происходит после нажатия Enter?",
    description: "Проследите путь веб-запроса от DNS до рендеринга.",
    type: "website",
    images: [{ url: new URL("og.png", siteUrl), width: 1200, height: 630, alt: "Что происходит после нажатия Enter?" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Что происходит после нажатия Enter?",
    description: "Интерактивная симуляция пути веб-запроса.",
    images: [new URL("og.png", siteUrl)],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={`${manrope.variable} ${plexMono.variable}`}>{children}</body>
    </html>
  );
}
