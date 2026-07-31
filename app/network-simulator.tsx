"use client";

import { useEffect, useRef } from "react";
import { computed, createApp, defineComponent, h, nextTick, ref } from "vue";

type Substep = {
  label: string;
  detail: string;
  signal: string;
  ms: number;
  exchanges: number;
};

type Stage = {
  key: string;
  short: string;
  title: string;
  actor: string;
  substeps: Substep[];
};

type RouteUnit = Substep & {
  stageIndex: number;
  substepIndex: number;
};

const stages: Stage[] = [
  {
    key: "url", short: "URL", title: "Разбор адреса", actor: "Браузер",
    substeps: [
      { label: "Ввод URL", detail: "Пользователь вводит адрес и нажимает Enter — браузер начинает навигацию.", signal: "https://example.com", ms: 3, exchanges: 0 },
      { label: "Разбор частей", detail: "Адрес делится на схему, домен, путь, параметры и фрагмент.", signal: "scheme · host · path · query", ms: 8, exchanges: 0 },
      { label: "Выбор порта", detail: "Схема HTTPS указывает на порт 443, HTTP — на порт 80.", signal: "https → :443", ms: 7, exchanges: 0 },
    ],
  },
  {
    key: "dns", short: "DNS", title: "Поиск IP-адреса", actor: "DNS",
    substeps: [
      { label: "Кеш браузера", detail: "Сначала браузер проверяет, не знает ли он IP этого домена.", signal: "browser DNS cache → miss", ms: 8, exchanges: 0 },
      { label: "Кеш системы", detail: "Затем запрос проверяет DNS-кеш операционной системы и файл hosts.", signal: "OS cache / hosts → miss", ms: 12, exchanges: 0 },
      { label: "Рекурсивный DNS", detail: "Запрос уходит роутеру или ближайшему DNS-резолверу провайдера.", signal: "client → recursive resolver", ms: 35, exchanges: 1 },
      { label: "Root и TLD", detail: "Резолвер узнаёт у корневого сервера, кто отвечает за доменную зону.", signal: "root → .com nameserver", ms: 55, exchanges: 1 },
      { label: "Авторитативный DNS", detail: "Авторитативный сервер возвращает финальную A- или AAAA-запись.", signal: "example.com → 93.184.216.34", ms: 70, exchanges: 1 },
    ],
  },
  {
    key: "tcp", short: "TCP", title: "Тройное рукопожатие", actor: "Сеть",
    substeps: [
      { label: "SYN", detail: "Клиент предлагает установить соединение и отправляет начальный номер последовательности.", signal: "client → SYN", ms: 40, exchanges: 1 },
      { label: "SYN-ACK", detail: "Сервер принимает предложение и подтверждает готовность к обмену.", signal: "server → SYN-ACK", ms: 40, exchanges: 1 },
      { label: "ACK", detail: "Клиент подтверждает ответ — надёжное TCP-соединение установлено.", signal: "client → ACK · connected", ms: 40, exchanges: 1 },
    ],
  },
  {
    key: "tls", short: "TLS", title: "Защищённый канал", actor: "TLS",
    substeps: [
      { label: "Client Hello", detail: "Браузер сообщает поддерживаемые версии TLS, шифры и случайные данные.", signal: "ClientHello · TLS 1.3", ms: 35, exchanges: 1 },
      { label: "Сертификат", detail: "Сервер выбирает параметры и отправляет сертификат со своим публичным ключом.", signal: "ServerHello + Certificate", ms: 45, exchanges: 1 },
      { label: "Проверка", detail: "Браузер проверяет домен, срок действия и цепочку доверия сертификата.", signal: "CA chain → verified", ms: 35, exchanges: 0 },
      { label: "Сессионный ключ", detail: "Стороны получают общий секрет — дальнейший трафик будет зашифрован.", signal: "session keys → encrypted", ms: 45, exchanges: 1 },
    ],
  },
  {
    key: "http", short: "GET", title: "HTTP-запрос", actor: "HTTP",
    substeps: [
      { label: "Метод и путь", detail: "Браузер формирует стартовую строку запроса с методом GET и путём.", signal: "GET / HTTP/1.1", ms: 8, exchanges: 0 },
      { label: "Заголовки", detail: "Добавляются Host, User-Agent, Accept-Language, Cookie и другие заголовки.", signal: "Host · Accept · Cookie", ms: 12, exchanges: 0 },
      { label: "Отправка", detail: "Готовый запрос уходит по защищённому TCP-каналу на сервер.", signal: "encrypted request → server", ms: 20, exchanges: 1 },
    ],
  },
  {
    key: "response", short: "200", title: "Ответ сервера", actor: "Сервер",
    substeps: [
      { label: "Обработка", detail: "Веб-сервер находит ресурс и подготавливает ответ клиенту.", signal: "route → document", ms: 75, exchanges: 0 },
      { label: "Статус и заголовки", detail: "Первыми приходят статус 200 OK, Content-Type, Cache-Control и cookies.", signal: "200 OK · text/html", ms: 35, exchanges: 1 },
      { label: "Тело ответа", detail: "HTML-документ передаётся частями; браузер может начать работу до конца загрузки.", signal: "HTML byte stream → browser", ms: 50, exchanges: 1 },
    ],
  },
  {
    key: "assets", short: "RES", title: "Загрузка ресурсов", actor: "Браузер",
    substeps: [
      { label: "Парсинг HTML", detail: "Поток HTML разбирается сверху вниз, и браузер обнаруживает ссылки на ресурсы.", signal: "HTML tokenizer → tags", ms: 55, exchanges: 0 },
      { label: "CSS и JavaScript", detail: "Стили, скрипты и шрифты получают собственные приоритетные запросы.", signal: "CSS · JS · FONT", ms: 95, exchanges: 2 },
      { label: "Изображения", detail: "Изображения загружаются параллельно и декодируются перед отображением.", signal: "IMG requests → decode", ms: 100, exchanges: 2 },
    ],
  },
  {
    key: "render", short: "PIX", title: "Рендеринг страницы", actor: "Рендер",
    substeps: [
      { label: "DOM", detail: "Из HTML строится дерево элементов документа — DOM.", signal: "HTML → DOM tree", ms: 65, exchanges: 0 },
      { label: "CSSOM", detail: "Правила CSS разбираются и превращаются в дерево стилей CSSOM.", signal: "CSS → CSSOM", ms: 65, exchanges: 0 },
      { label: "Layout", detail: "DOM и CSSOM образуют render tree; браузер вычисляет размеры и позиции.", signal: "render tree → layout", ms: 80, exchanges: 0 },
      { label: "Paint", detail: "Элементы рисуются по слоям и компонуются в финальное изображение страницы.", signal: "paint → composite → pixels", ms: 70, exchanges: 0 },
      { label: "Интерактивность", detail: "JavaScript и обработчики событий готовы реагировать на действия пользователя.", signal: "DOMContentLoaded → interactive", ms: 40, exchanges: 0 },
    ],
  },
];

const cachedDnsSubsteps: Substep[] = [
  { label: "Попадание в кеш", detail: "Браузер сразу находит сохранённую DNS-запись и не обращается во внешнюю сеть.", signal: "browser DNS cache → 93.184.216.34", ms: 8, exchanges: 0 },
];

const VueSimulator = defineComponent({
  name: "VueNetworkSimulator",
  setup() {
    const url = ref("https://example.com");
    const cache = ref(false);
    const speed = ref(0.75);
    const mode = ref<"auto" | "manual">("auto");
    const current = ref(-1);
    const done = ref(false);
    const running = ref(false);
    const token = ref(0);

    const secure = computed(() => {
      try { return new URL(/^https?:\/\//i.test(url.value) ? url.value : `https://${url.value}`).protocol === "https:"; }
      catch { return true; }
    });

    const stageSubsteps = (stage: Stage) => stage.key === "dns" && cache.value ? cachedDnsSubsteps : stage.substeps;
    const route = computed<RouteUnit[]>(() => stages.flatMap((stage, stageIndex) => {
      if (stage.key === "tls" && !secure.value) return [];
      return stageSubsteps(stage).map((substep, substepIndex) => ({ ...substep, stageIndex, substepIndex }));
    }));
    const activeUnit = computed(() => current.value >= 0 && current.value < route.value.length ? route.value[current.value] : null);
    const activeStageIndex = computed(() => activeUnit.value?.stageIndex ?? -1);
    const activeStage = computed(() => activeStageIndex.value >= 0 ? stages[activeStageIndex.value] : null);
    const activeStageSubsteps = computed(() => activeStage.value ? stageSubsteps(activeStage.value) : []);
    const progress = computed(() => done.value ? 100 : current.value < 0 ? 0 : ((current.value + 1) / route.value.length) * 100);
    const elapsed = computed(() => route.value.slice(0, done.value ? route.value.length : current.value + 1).reduce((sum, unit) => sum + unit.ms, 0));
    const exchanges = computed(() => route.value.slice(0, done.value ? route.value.length : current.value + 1).reduce((sum, unit) => sum + unit.exchanges, 0));
    const totalEstimate = computed(() => route.value.reduce((sum, unit) => sum + unit.ms, 0));

    const pause = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

    function normalizeUrl() {
      try {
        const parsed = new URL(/^https?:\/\//i.test(url.value.trim()) ? url.value.trim() : `https://${url.value.trim()}`);
        url.value = parsed.href.replace(/\/$/, "");
      } catch {
        url.value = "https://example.com";
      }
    }

    function reset() {
      token.value += 1;
      current.value = -1;
      done.value = false;
      running.value = false;
    }

    function setMode(nextMode: "auto" | "manual") {
      if (mode.value === nextMode) return;
      mode.value = nextMode;
      reset();
    }

    async function run() {
      normalizeUrl();
      const runId = ++token.value;
      current.value = -1;
      done.value = false;
      running.value = true;
      await nextTick();

      for (let index = 0; index < route.value.length; index += 1) {
        if (runId !== token.value || mode.value !== "auto") return;
        current.value = index;
        await pause(Math.max(720, route.value[index].ms * 3.2) / speed.value);
      }
      if (runId !== token.value) return;
      done.value = true;
      running.value = false;
    }

    function nextStep() {
      normalizeUrl();
      running.value = false;
      if (done.value) current.value = -1;
      done.value = false;
      if (current.value < route.value.length - 1) current.value += 1;
      else done.value = true;
    }

    function previousStep() {
      token.value += 1;
      running.value = false;
      if (done.value) {
        done.value = false;
        current.value = route.value.length - 1;
      } else {
        current.value = Math.max(-1, current.value - 1);
      }
    }

    const stageClass = (stage: Stage, index: number) => {
      const positions = route.value.map((unit, routeIndex) => unit.stageIndex === index ? routeIndex : -1).filter(position => position >= 0);
      const stageFinished = done.value || (positions.length > 0 && current.value > positions[positions.length - 1]);
      return {
        "flow-step": true,
        "is-active": index === activeStageIndex.value && !done.value,
        "is-complete": stageFinished,
        "is-skipped": stage.key === "tls" && !secure.value,
      };
    };

    return () => h("section", { class: "simulator", "aria-label": "Симулятор загрузки веб-страницы" }, [
      h("aside", { class: "control-panel" }, [
        h("div", { class: "panel-kicker" }, [h("span", "Параметры"), h("span", mode.value === "auto" ? "AUTO" : "MANUAL")]),
        h("label", { class: "field-label", for: "sim-url" }, "Адрес сайта"),
        h("div", { class: "url-field" }, [
          h("span", { class: "lock-glyph", "aria-hidden": "true" }, secure.value ? "◆" : "◇"),
          h("input", {
            id: "sim-url", value: url.value, disabled: running.value, inputmode: "url", spellcheck: false,
            onInput: (event: Event) => url.value = (event.target as HTMLInputElement).value,
            onKeydown: (event: KeyboardEvent) => { if (event.key === "Enter") mode.value === "auto" ? run() : nextStep(); },
          }),
        ]),
        h("div", { class: "mode-control", role: "group", "aria-label": "Режим прохождения" }, [
          h("button", { type: "button", class: mode.value === "auto" ? "is-selected" : "", "aria-pressed": mode.value === "auto", onClick: () => setMode("auto") }, "Авто"),
          h("button", { type: "button", class: mode.value === "manual" ? "is-selected" : "", "aria-pressed": mode.value === "manual", onClick: () => setMode("manual") }, "Вручную"),
        ]),
        h("div", { class: "control-divider" }),
        h("div", { class: "control-row" }, [
          h("div", [h("strong", "DNS-кеш"), h("small", cache.value ? "IP уже известен" : "Полный поиск")]),
          h("button", {
            type: "button", class: ["switch", cache.value && "is-on"], role: "switch", "aria-label": "DNS-кеш", "aria-checked": cache.value,
            disabled: running.value, onClick: () => { cache.value = !cache.value; reset(); },
          }, h("span")),
        ]),
        mode.value === "auto" ? [
          h("div", { class: "control-divider" }),
          h("label", { class: "range-head", for: "sim-speed" }, [h("span", "Темп показа"), h("strong", `${speed.value.toLocaleString("ru-RU")}×`)]),
          h("input", {
            id: "sim-speed", class: "range", type: "range", min: 0.5, max: 1.25, step: 0.25, value: speed.value,
            onInput: (event: Event) => speed.value = Number((event.target as HTMLInputElement).value),
          }),
          h("div", { class: "range-labels", "aria-hidden": "true" }, [h("span", "подробно"), h("span", "быстрее")]),
        ] : null,
        mode.value === "auto"
          ? h("button", { type: "button", class: "run-button", disabled: running.value, onClick: run }, [
              h("span", { class: running.value ? "spinner" : "run-icon", "aria-hidden": "true" }, running.value ? "" : "→"),
              running.value ? "Показываем путь" : done.value ? "Запустить снова" : "Начать показ",
            ])
          : h("div", { class: "manual-controls" }, [
              h("button", { type: "button", class: "manual-button", disabled: current.value < 0, onClick: previousStep }, "← Назад"),
              h("button", { type: "button", class: "manual-button is-primary", onClick: nextStep }, done.value ? "Сначала ↺" : "Далее →"),
            ]),
        h("p", { class: "estimate" }, mode.value === "auto" ? `Полный путь: ≈ ${totalEstimate.value} мс` : `${Math.min(current.value + 1, route.value.length)} из ${route.value.length} подшагов`),
      ]),

      h("div", { class: "simulation-stage" }, [
        h("div", { class: "stage-topline" }, [
          h("div", [h("span", { class: "stage-index" }, activeStage.value ? String(activeStageIndex.value + 1).padStart(2, "0") : "00"), h("span", "/ 08")]),
          h("div", { class: "protocol-chip" }, [h("span", { class: secure.value ? "chip-dot secure" : "chip-dot" }), secure.value ? "HTTPS · 443" : "HTTP · 80"]),
        ]),

        h("div", { class: "flow", role: "list", "aria-label": "Этапы загрузки" }, stages.map((stage, index) =>
          h("div", { class: stageClass(stage, index), role: "listitem", key: stage.key }, [
            h("div", { class: "flow-node" }, [h("span", stage.short), index < stages.length - 1 ? h("i") : null]),
            h("small", stage.title),
          ])
        )),

        h("div", { class: "progress-rail", "aria-hidden": "true" }, h("span", { style: { width: `${progress.value}%` } })),

        h("div", { class: ["event-console", done.value && "is-done"] }, [
          activeStage.value ? h("div", { class: "substep-track", "aria-label": `Подшаги этапа ${activeStage.value.title}` },
            activeStageSubsteps.value.map((substep, index) => h("div", {
              class: ["substep-item", index === activeUnit.value?.substepIndex && "is-active", index < (activeUnit.value?.substepIndex ?? -1) && "is-complete"],
              key: substep.label,
            }, [
              h("span", { class: "substep-circle", "aria-hidden": "true" }, String(index + 1)),
              h("small", substep.label),
            ]))
          ) : h("div", { class: "substep-placeholder" }, "Подшаги появятся после запуска"),
          h("div", { class: "event-content" }, [
            h("div", { class: "event-copy" }, [
              h("span", { class: "event-actor" }, done.value ? "Готово" : activeStage.value?.title ?? "Браузер"),
              h("h2", done.value ? "Страница готова к работе" : activeUnit.value?.label ?? "Введите адрес и начните путь"),
              h("p", done.value ? "Пиксели отрисованы, обработчики событий активны — пользователь может взаимодействовать со страницей." : activeUnit.value?.detail ?? "Вы увидите не только большие этапы, но и каждый внутренний подшаг."),
            ]),
            h("code", { class: "signal-line" }, done.value ? "load → interactive" : activeUnit.value?.signal ?? "awaiting input…"),
          ]),
        ]),

        h("div", { class: "metric-row", "aria-live": "polite" }, [
          h("div", [h("span", "Условное время"), h("strong", [String(elapsed.value), " ", h("small", "мс")])]),
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
