"use client";

import { useEffect, useSyncExternalStore } from "react";
import { detectBrowserLocale, type Locale } from "./i18n";
import { NetworkSimulator } from "./network-simulator";

const shellCopy: Record<Locale, { title: string; description: string; brand: string }> = {
  ru: {
    title: "Что происходит после нажатия Enter в адресной строке браузера?",
    description: "Интерактивный путь запроса через ОС, DNS, интернет, CDN, backend и рендеринг страницы.",
    brand: "Что происходит после нажатия",
  },
  en: {
    title: "What happens after you press Enter in the browser?",
    description: "An interactive path across the OS, DNS, internet, CDN, backend, and page rendering.",
    brand: "What happens after you press",
  },
};

const subscribeToBrowserLocale = () => () => undefined;
const getDefaultLocale = (): Locale => "en";

export function LocalizedShell() {
  const locale = useSyncExternalStore(subscribeToBrowserLocale, detectBrowserLocale, getDefaultLocale);
  const copy = shellCopy[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = copy.title;

    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    description?.setAttribute("content", copy.description);
  }, [copy, locale]);

  return (
    <main className="page-shell">
      <header id="top" className="site-header">
        <a className="brand" href="#top">{copy.brand} <em>{locale === "ru" ? "Enter в адресной строке браузера?" : "Enter in the browser?"}</em></a>
      </header>

      <NetworkSimulator />

      <footer className="site-footer">
        <a href="https://t.me/devopsbrain" target="_blank" rel="noreferrer">Telegram · @devopsbrain ↗</a>
      </footer>
    </main>
  );
}
