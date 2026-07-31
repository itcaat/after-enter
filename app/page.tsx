import type { Metadata } from "next";
import { NetworkSimulator } from "./network-simulator";

export const metadata: Metadata = {
  title: "Inside Networking — путь веб-запроса",
  description: "Интерактивная симуляция пути от URL до готовой веб-страницы.",
};

export default function Home() {
  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Inside Networking — наверх">
          <span className="brand-mark" aria-hidden="true">IN</span>
          <span>Inside Networking</span>
        </a>
        <div className="header-status">
          <span className="status-dot" aria-hidden="true" />
          Учебная среда
        </div>
      </header>

      <section id="top" className="hero">
        <div className="eyebrow"><span>01</span> Путь веб-запроса</div>
        <h1>Что происходит после<br />нажатия <em>Enter?</em></h1>
        <p>
          Проследите весь маршрут: от поиска IP-адреса до DOM, CSSOM
          и первых пикселей на экране.
        </p>
      </section>

      <NetworkSimulator />

      <footer className="site-footer">
        <span>Интерактивный разбор сетевого запроса</span>
        <a href="https://habr.com/ru/companies/gnivc/articles/861432/" target="_blank" rel="noreferrer">
          По материалам статьи на Хабре ↗
        </a>
      </footer>
    </main>
  );
}
