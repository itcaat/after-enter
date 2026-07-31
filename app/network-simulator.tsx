"use client";

import { useEffect, useRef } from "react";
import { createApp, defineComponent, h, ref, computed, nextTick } from "vue";

type Stage = {
  key: string;
  short: string;
  title: string;
  detail: string;
  ms: number;
  exchanges: number;
  actor: string;
  signal: string;
};

const stages: Stage[] = [
  { key: "url", short: "URL", title: "Разбор адреса", detail: "Браузер выделяет протокол, домен, путь и определяет порт.", ms: 18, exchanges: 0, actor: "Браузер", signal: "https://example.com" },
  { key: "dns", short: "DNS", title: "Поиск IP-адреса", detail: "Проверяются кеши браузера и ОС. При промахе запрос идёт к DNS-серверам.", ms: 180, exchanges: 1, actor: "DNS", signal: "example.com → 93.184.216.34" },
  { key: "tcp", short: "TCP", title: "Тройное рукопожатие", detail: "SYN, SYN-ACK и ACK создают надёжное соединение между клиентом и сервером.", ms: 120, exchanges: 1, actor: "Сеть", signal: "SYN → SYN-ACK → ACK" },
  { key: "tls", short: "TLS", title: "Защищённый канал", detail: "Стороны проверяют сертификат, выбирают шифр и согласуют сессионные ключи.", ms: 160, exchanges: 2, actor: "Сеть", signal: "Certificate + session key" },
  { key: "http", short: "GET", title: "HTTP-запрос", detail: "Браузер отправляет метод GET, путь и заголовки запроса.", ms: 40, exchanges: 1, actor: "Сервер", signal: "GET / HTTP/1.1" },
  { key: "response", short: "200", title: "Ответ сервера", detail: "Статус, заголовки и HTML-документ возвращаются в браузер.", ms: 160, exchanges: 1, actor: "Сервер", signal: "200 OK · text/html" },
  { key: "assets", short: "RES", title: "Загрузка ресурсов", detail: "Из HTML браузер узнаёт о CSS, JavaScript, шрифтах и изображениях.", ms: 250, exchanges: 3, actor: "Браузер", signal: "CSS · JS · IMG" },
  { key: "render", short: "PIX", title: "Рендеринг страницы", detail: "DOM и CSSOM образуют render tree, затем следуют layout, paint и интерактивность.", ms: 320, exchanges: 0, actor: "Рендер", signal: "DOM + CSSOM → pixels" },
];

const VueSimulator = defineComponent({
  name: "VueNetworkSimulator",
  setup() {
    const url = ref("https://example.com");
    const cache = ref(false);
    const speed = ref(1);
    const current = ref(-1);
    const done = ref(false);
    const running = ref(false);
    const elapsed = ref(0);
    const exchanges = ref(0);
    const token = ref(0);

    const secure = computed(() => {
      try { return new URL(/^https?:\/\//i.test(url.value) ? url.value : `https://${url.value}`).protocol === "https:"; }
      catch { return true; }
    });
    const activeStage = computed(() => current.value >= 0 ? stages[current.value] : null);
    const progress = computed(() => done.value ? 100 : current.value < 0 ? 0 : (current.value / (stages.length - 1)) * 100);
    const totalEstimate = computed(() => {
      return stages.reduce((sum, stage) => {
        if (stage.key === "tls" && !secure.value) return sum;
        if (stage.key === "dns" && cache.value) return sum + 25;
        return sum + stage.ms;
      }, 0);
    });

    const pause = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

    async function run() {
      const runId = ++token.value;
      current.value = -1;
      done.value = false;
      elapsed.value = 0;
      exchanges.value = 0;
      running.value = true;
      try {
        const parsed = new URL(/^https?:\/\//i.test(url.value.trim()) ? url.value.trim() : `https://${url.value.trim()}`);
        url.value = parsed.href.replace(/\/$/, "");
      } catch {
        url.value = "https://example.com";
      }
      await nextTick();

      for (let index = 0; index < stages.length; index += 1) {
        if (runId !== token.value) return;
        const stage = stages[index];
        current.value = index;
        if (stage.key === "tls" && !secure.value) {
          await pause(340 / speed.value);
          continue;
        }
        const duration = stage.key === "dns" && cache.value ? 25 : stage.ms;
        elapsed.value += Math.round(duration / speed.value);
        exchanges.value += stage.key === "dns" && cache.value ? 0 : stage.exchanges;
        await pause(Math.max(520, duration * 2.7) / speed.value);
      }
      if (runId !== token.value) return;
      done.value = true;
      running.value = false;
    }

    const stepClass = (stage: Stage, index: number) => ({
      "flow-step": true,
      "is-active": index === current.value && !done.value,
      "is-complete": index < current.value || done.value,
      "is-skipped": stage.key === "tls" && !secure.value,
    });

    return () => h("section", { class: "simulator", "aria-label": "Симулятор загрузки веб-страницы" }, [
      h("aside", { class: "control-panel" }, [
        h("div", { class: "panel-kicker" }, [h("span", "Параметры"), h("span", "LIVE")]),
        h("label", { class: "field-label", for: "sim-url" }, "Адрес сайта"),
        h("div", { class: "url-field" }, [
          h("span", { class: "lock-glyph", "aria-hidden": "true" }, secure.value ? "◆" : "◇"),
          h("input", {
            id: "sim-url", value: url.value, disabled: running.value, inputmode: "url", spellcheck: false,
            onInput: (event: Event) => url.value = (event.target as HTMLInputElement).value,
            onKeydown: (event: KeyboardEvent) => { if (event.key === "Enter" && !running.value) run(); },
          }),
        ]),
        h("div", { class: "control-divider" }),
        h("div", { class: "control-row" }, [
          h("div", [h("strong", "DNS-кеш"), h("small", cache.value ? "IP уже известен" : "Полный поиск")]),
          h("button", {
            type: "button", class: ["switch", cache.value && "is-on"], role: "switch", "aria-checked": cache.value,
            disabled: running.value, onClick: () => cache.value = !cache.value,
          }, h("span")),
        ]),
        h("div", { class: "control-divider" }),
        h("label", { class: "range-head", for: "sim-speed" }, [h("span", "Скорость"), h("strong", `${speed.value.toLocaleString("ru-RU")}×`)]),
        h("input", {
          id: "sim-speed", class: "range", type: "range", min: 0.5, max: 2, step: 0.5, value: speed.value,
          onInput: (event: Event) => speed.value = Number((event.target as HTMLInputElement).value),
        }),
        h("div", { class: "range-labels", "aria-hidden": "true" }, [h("span", "медленно"), h("span", "быстро")]),
        h("button", { type: "button", class: "run-button", disabled: running.value, onClick: run }, [
          h("span", { class: running.value ? "spinner" : "run-icon", "aria-hidden": "true" }, running.value ? "" : "→"),
          running.value ? "Запрос выполняется" : done.value ? "Запустить снова" : "Нажать Enter",
        ]),
        h("p", { class: "estimate" }, `Расчётный путь: ≈ ${totalEstimate.value} мс`),
      ]),

      h("div", { class: "simulation-stage" }, [
        h("div", { class: "stage-topline" }, [
          h("div", [h("span", { class: "stage-index" }, activeStage.value ? String(current.value + 1).padStart(2, "0") : "00"), h("span", "/ 08")]),
          h("div", { class: "protocol-chip" }, [h("span", { class: secure.value ? "chip-dot secure" : "chip-dot" }), secure.value ? "HTTPS · 443" : "HTTP · 80"]),
        ]),

        h("div", { class: "flow", role: "list", "aria-label": "Этапы загрузки" }, stages.map((stage, index) =>
          h("div", { class: stepClass(stage, index), role: "listitem", key: stage.key }, [
            h("div", { class: "flow-node" }, [h("span", stage.short), index < stages.length - 1 ? h("i") : null]),
            h("small", stage.title),
          ])
        )),

        h("div", { class: "progress-rail", "aria-hidden": "true" }, h("span", { style: { width: `${progress.value}%` } })),

        h("div", { class: ["event-console", done.value && "is-done"] }, [
          h("div", { class: "event-copy" }, [
            h("span", { class: "event-actor" }, done.value ? "Готово" : activeStage.value?.actor ?? "Браузер"),
            h("h2", done.value ? "Страница готова к работе" : activeStage.value?.title ?? "Введите адрес и начните путь"),
            h("p", done.value ? "Пиксели отрисованы, обработчики событий активны — пользователь может взаимодействовать со страницей." : activeStage.value?.detail ?? "Вы увидите, как доменное имя превращается в готовый интерфейс."),
          ]),
          h("code", { class: "signal-line" }, done.value ? "load → interactive" : activeStage.value?.signal ?? "awaiting input…"),
        ]),

        h("div", { class: "metric-row", "aria-live": "polite" }, [
          h("div", [h("span", "Условное время"), h("strong", `${elapsed.value} `, h("small", "мс"))]),
          h("div", [h("span", "Сетевые обмены"), h("strong", String(exchanges.value))]),
          h("div", [h("span", "Текущий узел"), h("strong", done.value ? "Интерактив" : activeStage.value?.actor ?? "—")]),
        ]),
      ]),
    ]);
  },
});

export function NetworkSimulator() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const app = createApp(VueSimulator);
    app.mount(mountRef.current);
    return () => app.unmount();
  }, []);

  return <div ref={mountRef} className="vue-mount" />;
}
