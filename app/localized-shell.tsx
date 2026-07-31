"use client";

import { useEffect, useSyncExternalStore } from "react";
import { detectBrowserLocale, type Locale } from "./i18n";
import { NetworkSimulator } from "./network-simulator";

const shellCopy: Record<Locale, { title: string; description: string; brand: string; source: string }> = {
  ru: {
    title: "Что происходит после нажатия Enter?",
    description: "Интерактивная симуляция пути от URL до готовой веб-страницы.",
    brand: "Что происходит после нажатия",
    source: "Источники на Хабре",
  },
  en: {
    title: "What happens after you press Enter?",
    description: "An interactive simulation of a web request, from the URL to a rendered page.",
    brand: "What happens after you press",
    source: "Sources on Habr",
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
        <a className="brand" href="#top">{copy.brand} <em>Enter?</em></a>
      </header>

      <NetworkSimulator />

      <footer className="site-footer">
        <span>{copy.source}:</span>
        <a href="https://habr.com/ru/companies/gnivc/articles/861432/" target="_blank" rel="noreferrer">2024 ↗</a>
        <a href="https://habr.com/ru/companies/htmlacademy/articles/254825/" target="_blank" rel="noreferrer">2015 ↗</a>
      </footer>
    </main>
  );
}
