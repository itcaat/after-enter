import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["cyrillic", "latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["cyrillic", "latin"], weight: ["400", "500", "600"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  return {
    metadataBase: base,
    title: "Inside Networking",
    description: "Интерактивная симуляция пути веб-запроса — от URL до пикселей.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "Что происходит после нажатия Enter?",
      description: "Проследите путь веб-запроса от DNS до рендеринга.",
      type: "website",
      images: [{ url: new URL("/og.png", base), width: 1200, height: 630, alt: "Inside Networking — путь веб-запроса" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Что происходит после нажатия Enter?",
      description: "Интерактивная симуляция пути веб-запроса.",
      images: [new URL("/og.png", base)],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={`${manrope.variable} ${plexMono.variable}`}>{children}</body>
    </html>
  );
}
