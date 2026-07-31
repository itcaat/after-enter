import type { Metadata } from "next";
import { NetworkSimulator } from "./network-simulator";

export const metadata: Metadata = {
  title: "Что происходит после нажатия Enter?",
  description: "Интерактивная симуляция пути от URL до готовой веб-страницы.",
};

export default function Home() {
  return (
    <main className="page-shell">
      <header id="top" className="site-header">
        <a className="brand" href="#top">Что происходит после нажатия <em>Enter?</em></a>
      </header>

      <NetworkSimulator />

      <footer className="site-footer">
        <a href="https://habr.com/ru/companies/gnivc/articles/861432/" target="_blank" rel="noreferrer">
          По материалам статьи на Хабре ↗
        </a>
      </footer>
    </main>
  );
}
