"use client";

import { useEffect, useRef } from "react";
import { computed, createApp, defineComponent, h, nextTick, ref, watch } from "vue";
import { detectBrowserLocale, type Locale } from "./i18n";

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

const russianStages: Stage[] = [
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

const russianCachedDnsSubsteps: Substep[] = [
  { label: "Попадание в кеш", detail: "Браузер сразу находит сохранённую DNS-запись и не обращается во внешнюю сеть.", signal: "browser DNS cache → 93.184.216.34", ms: 8, exchanges: 0 },
];

const russianSubstepPurpose: Record<string, string> = {
  "Ввод URL": "Запускает переход к сайту",
  "Разбор частей": "Помогает понять, куда обращаться",
  "Выбор порта": "Определяет точку подключения",
  "Кеш браузера": "Экономит внешний DNS-запрос",
  "Кеш системы": "Повторно использует известный адрес",
  "Рекурсивный DNS": "Берёт поиск адреса на себя",
  "Root и TLD": "Находит нужную доменную зону",
  "Авторитативный DNS": "Даёт окончательный IP-адрес",
  "Попадание в кеш": "Сразу возвращает сохранённый IP",
  "SYN": "Предлагает открыть соединение",
  "SYN-ACK": "Подтверждает готовность сервера",
  "ACK": "Завершает установку TCP-канала",
  "Client Hello": "Согласует возможности шифрования",
  "Сертификат": "Доказывает подлинность сервера",
  "Проверка": "Защищает от подмены сайта",
  "Сессионный ключ": "Шифрует дальнейший обмен",
  "Метод и путь": "Говорит, какой ресурс нужен",
  "Заголовки": "Передают контекст запроса",
  "Отправка": "Доставляет запрос серверу",
  "Обработка": "Находит и готовит результат",
  "Статус и заголовки": "Объясняет результат браузеру",
  "Тело ответа": "Передаёт содержимое страницы",
  "Парсинг HTML": "Находит структуру и зависимости",
  "CSS и JavaScript": "Добавляет стиль и поведение",
  "Изображения": "Наполняет страницу медиаконтентом",
  "DOM": "Создаёт структуру документа",
  "CSSOM": "Создаёт модель стилей",
  "Layout": "Рассчитывает размеры и позиции",
  "Paint": "Превращает элементы в пиксели",
  "Интерактивность": "Делает страницу управляемой",
};

const englishStages: Stage[] = [
  {
    key: "url", short: "URL", title: "Parse the address", actor: "Browser",
    substeps: [
      { label: "Enter the URL", detail: "The user enters an address and presses Enter, prompting the browser to start navigating.", signal: "https://example.com", ms: 3, exchanges: 0 },
      { label: "Parse its parts", detail: "The address is split into the scheme, domain, path, query parameters, and fragment.", signal: "scheme · host · path · query", ms: 8, exchanges: 0 },
      { label: "Choose the port", detail: "HTTPS uses port 443 by default, while HTTP uses port 80.", signal: "https → :443", ms: 7, exchanges: 0 },
    ],
  },
  {
    key: "dns", short: "DNS", title: "Find the IP address", actor: "DNS",
    substeps: [
      { label: "Browser cache", detail: "The browser first checks whether it already knows the IP address for this domain.", signal: "browser DNS cache → miss", ms: 8, exchanges: 0 },
      { label: "System cache", detail: "Next, the operating system checks its DNS cache and hosts file.", signal: "OS cache / hosts → miss", ms: 12, exchanges: 0 },
      { label: "Recursive DNS", detail: "The request goes to the router or the nearest recursive DNS resolver.", signal: "client → recursive resolver", ms: 35, exchanges: 1 },
      { label: "Root and TLD", detail: "The resolver asks a root server which name server is responsible for the domain zone.", signal: "root → .com nameserver", ms: 55, exchanges: 1 },
      { label: "Authoritative DNS", detail: "The authoritative server returns the final A or AAAA record.", signal: "example.com → 93.184.216.34", ms: 70, exchanges: 1 },
    ],
  },
  {
    key: "tcp", short: "TCP", title: "Three-way handshake", actor: "Network",
    substeps: [
      { label: "SYN", detail: "The client proposes a connection and sends its initial sequence number.", signal: "client → SYN", ms: 40, exchanges: 1 },
      { label: "SYN-ACK", detail: "The server accepts the proposal and confirms that it is ready to communicate.", signal: "server → SYN-ACK", ms: 40, exchanges: 1 },
      { label: "ACK", detail: "The client acknowledges the response, completing the reliable TCP connection.", signal: "client → ACK · connected", ms: 40, exchanges: 1 },
    ],
  },
  {
    key: "tls", short: "TLS", title: "Secure the channel", actor: "TLS",
    substeps: [
      { label: "Client Hello", detail: "The browser announces its supported TLS versions, cipher suites, and random data.", signal: "ClientHello · TLS 1.3", ms: 35, exchanges: 1 },
      { label: "Certificate", detail: "The server chooses the parameters and sends a certificate containing its public key.", signal: "ServerHello + Certificate", ms: 45, exchanges: 1 },
      { label: "Verification", detail: "The browser verifies the domain, expiry date, and certificate trust chain.", signal: "CA chain → verified", ms: 35, exchanges: 0 },
      { label: "Session key", detail: "Both sides derive a shared secret so that subsequent traffic is encrypted.", signal: "session keys → encrypted", ms: 45, exchanges: 1 },
    ],
  },
  {
    key: "http", short: "GET", title: "Send the HTTP request", actor: "HTTP",
    substeps: [
      { label: "Method and path", detail: "The browser builds the request line with the GET method and resource path.", signal: "GET / HTTP/1.1", ms: 8, exchanges: 0 },
      { label: "Headers", detail: "Host, User-Agent, Accept-Language, Cookie, and other headers add request context.", signal: "Host · Accept · Cookie", ms: 12, exchanges: 0 },
      { label: "Send", detail: "The finished request travels to the server through the encrypted TCP channel.", signal: "encrypted request → server", ms: 20, exchanges: 1 },
    ],
  },
  {
    key: "response", short: "200", title: "Receive the response", actor: "Server",
    substeps: [
      { label: "Process", detail: "The web server locates the resource and prepares the response for the client.", signal: "route → document", ms: 75, exchanges: 0 },
      { label: "Status and headers", detail: "The browser first receives 200 OK, Content-Type, Cache-Control, cookies, and other headers.", signal: "200 OK · text/html", ms: 35, exchanges: 1 },
      { label: "Response body", detail: "The HTML arrives in chunks, so the browser can start working before the download ends.", signal: "HTML byte stream → browser", ms: 50, exchanges: 1 },
    ],
  },
  {
    key: "assets", short: "RES", title: "Load resources", actor: "Browser",
    substeps: [
      { label: "Parse HTML", detail: "The browser parses the HTML stream from top to bottom and discovers linked resources.", signal: "HTML tokenizer → tags", ms: 55, exchanges: 0 },
      { label: "CSS and JavaScript", detail: "Stylesheets, scripts, and fonts receive their own prioritized requests.", signal: "CSS · JS · FONT", ms: 95, exchanges: 2 },
      { label: "Images", detail: "Images load in parallel and are decoded before they can be displayed.", signal: "IMG requests → decode", ms: 100, exchanges: 2 },
    ],
  },
  {
    key: "render", short: "PIX", title: "Render the page", actor: "Renderer",
    substeps: [
      { label: "DOM", detail: "The browser turns the HTML into the document object model, or DOM.", signal: "HTML → DOM tree", ms: 65, exchanges: 0 },
      { label: "CSSOM", detail: "CSS rules are parsed into a separate style model called the CSSOM.", signal: "CSS → CSSOM", ms: 65, exchanges: 0 },
      { label: "Layout", detail: "The DOM and CSSOM form a render tree; the browser calculates sizes and positions.", signal: "render tree → layout", ms: 80, exchanges: 0 },
      { label: "Paint", detail: "Elements are painted into layers and composited into the final page image.", signal: "paint → composite → pixels", ms: 70, exchanges: 0 },
      { label: "Interactivity", detail: "JavaScript and event handlers are ready to respond to the user.", signal: "DOMContentLoaded → interactive", ms: 40, exchanges: 0 },
    ],
  },
];

const englishCachedDnsSubsteps: Substep[] = [
  { label: "Cache hit", detail: "The browser immediately finds the saved DNS record and avoids an external network request.", signal: "browser DNS cache → 93.184.216.34", ms: 8, exchanges: 0 },
];

const englishSubstepPurpose: Record<string, string> = {
  "Enter the URL": "Starts navigation to the website",
  "Parse its parts": "Identifies where the browser should connect",
  "Choose the port": "Selects the network endpoint",
  "Browser cache": "Avoids an external DNS request",
  "System cache": "Reuses a previously known address",
  "Recursive DNS": "Handles the address lookup for the client",
  "Root and TLD": "Finds the correct domain zone",
  "Authoritative DNS": "Returns the final IP address",
  "Cache hit": "Immediately returns the saved IP",
  "SYN": "Proposes opening a connection",
  "SYN-ACK": "Confirms that the server is ready",
  "ACK": "Completes the TCP connection",
  "Client Hello": "Negotiates encryption capabilities",
  "Certificate": "Proves the server's identity",
  "Verification": "Protects against website impersonation",
  "Session key": "Encrypts the rest of the exchange",
  "Method and path": "Specifies which resource is needed",
  "Headers": "Provide context for the request",
  "Send": "Delivers the request to the server",
  "Process": "Finds and prepares the result",
  "Status and headers": "Explains the result to the browser",
  "Response body": "Transfers the page content",
  "Parse HTML": "Discovers the structure and dependencies",
  "CSS and JavaScript": "Adds presentation and behavior",
  "Images": "Fills the page with visual content",
  "DOM": "Creates the document structure",
  "CSSOM": "Creates the style model",
  "Layout": "Calculates sizes and positions",
  "Paint": "Turns elements into pixels",
  "Interactivity": "Makes the page responsive to input",
};

const uiCopy: Record<Locale, Record<string, string>> = {
  ru: {
    simulatorLabel: "Симулятор загрузки веб-страницы", parameters: "Параметры", websiteAddress: "Адрес сайта",
    modeLabel: "Режим прохождения", auto: "Авто", manual: "Вручную", dnsCache: "DNS-кеш", ipKnown: "IP уже известен",
    fullLookup: "Полный поиск", pace: "Темп показа", detailed: "подробно", faster: "быстрее", showing: "Показываем путь",
    runAgain: "Запустить снова", start: "Начать показ", back: "← Назад", restart: "Сначала ↺", next: "Далее →",
    fullPath: "Полный путь", substepsOf: "из", substeps: "подшагов", loadingStages: "Этапы загрузки", goStage: "Перейти к этапу",
    stageSubsteps: "Подшаги этапа", goSubstep: "Перейти к подшагу", defaultPurpose: "Обеспечивает следующий этап",
    substepsPlaceholder: "Подшаги появятся после запуска", ready: "Готово", browser: "Браузер", pageReady: "Страница готова к работе",
    enterAddress: "Введите адрес и начните путь", doneDetail: "Пиксели отрисованы, обработчики событий активны — пользователь может взаимодействовать со страницей.",
    introDetail: "Вы увидите не только большие этапы, но и каждый внутренний подшаг.", conditionalTime: "Условное время",
    networkExchanges: "Сетевые обмены", currentNode: "Текущий узел", interactive: "Интерактив", milliseconds: "мс",
  },
  en: {
    simulatorLabel: "Web page loading simulator", parameters: "Parameters", websiteAddress: "Website address",
    modeLabel: "Playback mode", auto: "Auto", manual: "Manual", dnsCache: "DNS cache", ipKnown: "IP already known",
    fullLookup: "Full lookup", pace: "Playback speed", detailed: "detailed", faster: "faster", showing: "Showing the route",
    runAgain: "Run again", start: "Start simulation", back: "← Back", restart: "Start over ↺", next: "Next →",
    fullPath: "Full route", substepsOf: "of", substeps: "substeps", loadingStages: "Loading stages", goStage: "Go to stage",
    stageSubsteps: "Substeps for", goSubstep: "Go to substep", defaultPurpose: "Enables the next stage",
    substepsPlaceholder: "Substeps will appear after you start", ready: "Ready", browser: "Browser", pageReady: "The page is ready",
    enterAddress: "Enter an address and start the journey", doneDetail: "Pixels are painted and event handlers are active, so the user can interact with the page.",
    introDetail: "You will see every major stage and each of its internal substeps.", conditionalTime: "Illustrative time",
    networkExchanges: "Network exchanges", currentNode: "Current node", interactive: "Interactive", milliseconds: "ms",
  },
};

const VueSimulator = defineComponent({
  name: "VueNetworkSimulator",
  setup() {
    const locale = detectBrowserLocale();
    const text = uiCopy[locale];
    const stages = locale === "ru" ? russianStages : englishStages;
    const cachedDnsSubsteps = locale === "ru" ? russianCachedDnsSubsteps : englishCachedDnsSubsteps;
    const substepPurpose = locale === "ru" ? russianSubstepPurpose : englishSubstepPurpose;
    const url = ref("https://example.com");
    const cache = ref(false);
    const speed = ref(0.75);
    const mode = ref<"auto" | "manual">("auto");
    const current = ref(-1);
    const done = ref(false);
    const running = ref(false);
    const token = ref(0);
    const flowRef = ref<HTMLElement | null>(null);
    const substepTrackRef = ref<HTMLElement | null>(null);

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

    function centerActive(container: HTMLElement | null, selector: string) {
      const target = container?.querySelector<HTMLElement>(selector);
      if (!container || !target) return;
      const left = target.offsetLeft - (container.clientWidth - target.offsetWidth) / 2;
      const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      container.scrollTo({ left: Math.max(0, left), behavior });
    }

    watch(current, async () => {
      await nextTick();
      centerActive(flowRef.value, ".flow-step.is-active");
      centerActive(substepTrackRef.value, ".substep-item.is-active");
    });

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

    function jumpToRouteIndex(routeIndex: number) {
      if (routeIndex < 0) return;
      normalizeUrl();
      token.value += 1;
      mode.value = "manual";
      running.value = false;
      done.value = false;
      current.value = routeIndex;
    }

    function jumpToStage(stageIndex: number) {
      jumpToRouteIndex(route.value.findIndex(unit => unit.stageIndex === stageIndex));
    }

    function jumpToSubstep(stageIndex: number, substepIndex: number) {
      jumpToRouteIndex(route.value.findIndex(unit => unit.stageIndex === stageIndex && unit.substepIndex === substepIndex));
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

    return () => h("section", { class: "simulator", "aria-label": text.simulatorLabel }, [
      h("aside", { class: "control-panel" }, [
        h("div", { class: "panel-kicker" }, [h("span", text.parameters), h("span", mode.value === "auto" ? "AUTO" : "MANUAL")]),
        h("label", { class: "field-label", for: "sim-url" }, text.websiteAddress),
        h("div", { class: "url-field" }, [
          h("span", { class: "lock-glyph", "aria-hidden": "true" }, secure.value ? "◆" : "◇"),
          h("input", {
            id: "sim-url", value: url.value, disabled: running.value, inputmode: "url", spellcheck: false,
            onInput: (event: Event) => url.value = (event.target as HTMLInputElement).value,
            onKeydown: (event: KeyboardEvent) => {
              if (event.key !== "Enter") return;
              if (mode.value === "auto") run();
              else nextStep();
            },
          }),
        ]),
        h("div", { class: "mode-control", role: "group", "aria-label": text.modeLabel }, [
          h("button", { type: "button", class: mode.value === "auto" ? "is-selected" : "", "aria-pressed": mode.value === "auto", onClick: () => setMode("auto") }, text.auto),
          h("button", { type: "button", class: mode.value === "manual" ? "is-selected" : "", "aria-pressed": mode.value === "manual", onClick: () => setMode("manual") }, text.manual),
        ]),
        h("div", { class: "control-divider" }),
        h("div", { class: "control-row" }, [
          h("div", [h("strong", text.dnsCache), h("small", cache.value ? text.ipKnown : text.fullLookup)]),
          h("button", {
            type: "button", class: ["switch", cache.value && "is-on"], role: "switch", "aria-label": text.dnsCache, "aria-checked": cache.value,
            disabled: running.value, onClick: () => { cache.value = !cache.value; reset(); },
          }, h("span")),
        ]),
        mode.value === "auto" ? [
          h("div", { class: "control-divider" }),
          h("label", { class: "range-head", for: "sim-speed" }, [h("span", text.pace), h("strong", `${speed.value.toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}×`)]),
          h("input", {
            id: "sim-speed", class: "range", type: "range", min: 0.5, max: 1.25, step: 0.25, value: speed.value,
            onInput: (event: Event) => speed.value = Number((event.target as HTMLInputElement).value),
          }),
          h("div", { class: "range-labels", "aria-hidden": "true" }, [h("span", text.detailed), h("span", text.faster)]),
        ] : null,
        mode.value === "auto"
          ? h("button", { type: "button", class: "run-button", disabled: running.value, onClick: run }, [
              h("span", { class: running.value ? "spinner" : "run-icon", "aria-hidden": "true" }, running.value ? "" : "→"),
              running.value ? text.showing : done.value ? text.runAgain : text.start,
            ])
          : h("div", { class: "manual-controls" }, [
              h("button", { type: "button", class: "manual-button", disabled: current.value < 0, onClick: previousStep }, text.back),
              h("button", { type: "button", class: "manual-button is-primary", onClick: nextStep }, done.value ? text.restart : text.next),
            ]),
        h("p", { class: "estimate" }, mode.value === "auto" ? `${text.fullPath}: ≈ ${totalEstimate.value} ${text.milliseconds}` : `${Math.min(current.value + 1, route.value.length)} ${text.substepsOf} ${route.value.length} ${text.substeps}`),
      ]),

      h("div", { class: "simulation-stage" }, [
        h("div", { class: "stage-topline" }, [
          h("div", [h("span", { class: "stage-index" }, activeStage.value ? String(activeStageIndex.value + 1).padStart(2, "0") : "00"), h("span", "/ 08")]),
          h("div", { class: "protocol-chip" }, [h("span", { class: secure.value ? "chip-dot secure" : "chip-dot" }), secure.value ? "HTTPS · 443" : "HTTP · 80"]),
        ]),

        h("div", { ref: flowRef, class: "flow", role: "list", "aria-label": text.loadingStages }, stages.map((stage, index) =>
          h("div", { class: stageClass(stage, index), role: "listitem", key: stage.key }, [
            h("div", { class: "flow-node" }, [
              h("button", {
                type: "button",
                class: "flow-circle",
                disabled: stage.key === "tls" && !secure.value,
                "aria-label": `${text.goStage}: ${stage.title}`,
                "aria-current": index === activeStageIndex.value && !done.value ? "step" : undefined,
                onClick: () => jumpToStage(index),
              }, stage.short),
              index < stages.length - 1 ? h("i") : null,
            ]),
            h("small", stage.title),
          ])
        )),

        h("div", { class: "progress-rail", "aria-hidden": "true" }, h("span", { style: { width: `${progress.value}%` } })),

        h("div", { class: ["event-console", done.value && "is-done"] }, [
          activeStage.value ? h("div", { ref: substepTrackRef, class: "substep-track", "aria-label": `${text.stageSubsteps} ${activeStage.value.title}` },
            activeStageSubsteps.value.map((substep, index) => h("div", {
              class: ["substep-item", index === activeUnit.value?.substepIndex && "is-active", index < (activeUnit.value?.substepIndex ?? -1) && "is-complete"],
              key: substep.label,
            }, [
              h("button", {
                type: "button",
                class: "substep-circle",
                "aria-label": `${text.goSubstep}: ${substep.label}`,
                "aria-current": index === activeUnit.value?.substepIndex ? "step" : undefined,
                onClick: () => jumpToSubstep(activeStageIndex.value, index),
              }, String(index + 1)),
              h("small", { class: "substep-label" }, substep.label),
              h("span", { class: "substep-why" }, substepPurpose[substep.label] ?? text.defaultPurpose),
            ]))
          ) : h("div", { class: "substep-placeholder" }, text.substepsPlaceholder),
          h("div", { class: "event-content" }, [
            h("div", { class: "event-copy" }, [
              h("span", { class: "event-actor" }, done.value ? text.ready : activeStage.value?.title ?? text.browser),
              h("h2", done.value ? text.pageReady : activeUnit.value?.label ?? text.enterAddress),
              h("p", done.value ? text.doneDetail : activeUnit.value?.detail ?? text.introDetail),
            ]),
            h("code", { class: "signal-line" }, done.value ? "load → interactive" : activeUnit.value?.signal ?? "awaiting input…"),
          ]),
        ]),

        h("div", { class: "metric-row", "aria-live": "polite" }, [
          h("div", [h("span", text.conditionalTime), h("strong", [String(elapsed.value), " ", h("small", text.milliseconds)])]),
          h("div", [h("span", text.networkExchanges), h("strong", String(exchanges.value))]),
          h("div", [h("span", text.currentNode), h("strong", done.value ? text.interactive : activeStage.value?.actor ?? "—")]),
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
