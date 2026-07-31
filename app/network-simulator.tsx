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
      { label: "Событие Enter", detail: "Операционная система доставляет событие клавиши активному окну браузера.", signal: "keyboard → OS → browser", ms: 2, exchanges: 0 },
      { label: "Разбор частей", detail: "Адрес делится на схему, домен, путь, параметры и фрагмент.", signal: "scheme · host · path · query", ms: 8, exchanges: 0 },
      { label: "HSTS", detail: "Браузер проверяет, нужно ли принудительно заменить HTTP на защищённый HTTPS.", signal: "http → HSTS → https", ms: 2, exchanges: 0 },
      { label: "Punycode", detail: "Если домен содержит Unicode, он переводится в ASCII-представление, понятное DNS.", signal: "Unicode? → IDNA / xn--…", ms: 2, exchanges: 0 },
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
    key: "tcp", short: "TCP", title: "TCP-соединение", actor: "Сеть",
    substeps: [
      { label: "Открытие сокета", detail: "Браузер просит ОС создать потоковый сокет к найденному IP и порту.", signal: "socket(AF_INET, SOCK_STREAM)", ms: 4, exchanges: 0 },
      { label: "ARP и шлюз", detail: "Устройство узнаёт MAC-адрес следующего узла: сервера в подсети или шлюза.", signal: "ARP who-has → MAC", ms: 18, exchanges: 1 },
      { label: "SYN", detail: "Клиент предлагает установить соединение и отправляет начальный номер последовательности.", signal: "client → SYN", ms: 40, exchanges: 1 },
      { label: "Маршрутизация", detail: "IP-пакет с SYN проходит через цепочку маршрутизаторов к сети сервера.", signal: "SYN packet → next hops", ms: 25, exchanges: 1 },
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
      { label: "Проверка кеша", detail: "Сервер решает, вернуть новое содержимое или подтвердить актуальность копии браузера.", signal: "ETag → 304 or 200", ms: 10, exchanges: 0 },
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
      { label: "Render tree", detail: "Видимые DOM-узлы и вычисленные стили объединяются в дерево рендеринга.", signal: "DOM + CSSOM → render tree", ms: 35, exchanges: 0 },
      { label: "Layout", detail: "Браузер вычисляет размеры, координаты и взаимное расположение всех видимых боксов.", signal: "render tree → geometry", ms: 80, exchanges: 0 },
      { label: "Paint", detail: "Движок создаёт список команд рисования для текста, фонов, границ и эффектов.", signal: "boxes → display list", ms: 45, exchanges: 0 },
      { label: "Растеризация", detail: "Команды рисования превращаются в пиксельные тайлы, часто с участием GPU.", signal: "display list → tiles", ms: 45, exchanges: 0 },
      { label: "Композиция", detail: "Композитор собирает слои в финальный кадр и отправляет его на экран.", signal: "layers → composite → frame", ms: 25, exchanges: 0 },
      { label: "Интерактивность", detail: "JavaScript и обработчики событий готовы реагировать на действия пользователя.", signal: "DOMContentLoaded → interactive", ms: 40, exchanges: 0 },
    ],
  },
];

const russianCachedDnsSubsteps: Substep[] = [
  { label: "Попадание в кеш", detail: "Браузер сразу находит сохранённую DNS-запись и не обращается во внешнюю сеть.", signal: "browser DNS cache → 93.184.216.34", ms: 8, exchanges: 0 },
];

const russianSubstepPurpose: Record<string, string> = {
  "Ввод URL": "Запускает переход к сайту",
  "Событие Enter": "Передаёт команду активному браузеру",
  "Разбор частей": "Помогает понять, куда обращаться",
  "HSTS": "Не допускает небезопасный первый запрос",
  "Punycode": "Готовит Unicode-домен для DNS",
  "Выбор порта": "Определяет точку подключения",
  "Кеш браузера": "Экономит внешний DNS-запрос",
  "Кеш системы": "Повторно использует известный адрес",
  "Рекурсивный DNS": "Берёт поиск адреса на себя",
  "Root и TLD": "Находит нужную доменную зону",
  "Авторитативный DNS": "Даёт окончательный IP-адрес",
  "Попадание в кеш": "Сразу возвращает сохранённый IP",
  "Открытие сокета": "Создаёт сетевую конечную точку",
  "ARP и шлюз": "Находит следующий узел локальной сети",
  "Маршрутизация": "Доставляет пакет к сети сервера",
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
  "Проверка кеша": "Избегает повторной передачи ресурса",
  "Статус и заголовки": "Объясняет результат браузеру",
  "Тело ответа": "Передаёт содержимое страницы",
  "Парсинг HTML": "Находит структуру и зависимости",
  "CSS и JavaScript": "Добавляет стиль и поведение",
  "Изображения": "Наполняет страницу медиаконтентом",
  "DOM": "Создаёт структуру документа",
  "CSSOM": "Создаёт модель стилей",
  "Render tree": "Оставляет видимое для отрисовки",
  "Layout": "Рассчитывает размеры и позиции",
  "Paint": "Описывает порядок рисования",
  "Растеризация": "Создаёт пиксельные тайлы слоёв",
  "Композиция": "Собирает финальный кадр",
  "Интерактивность": "Делает страницу управляемой",
};

const englishStages: Stage[] = [
  {
    key: "url", short: "URL", title: "Parse the address", actor: "Browser",
    substeps: [
      { label: "Enter the URL", detail: "The user enters an address and presses Enter, prompting the browser to start navigating.", signal: "https://example.com", ms: 3, exchanges: 0 },
      { label: "Enter event", detail: "The operating system delivers the key event to the browser's active window.", signal: "keyboard → OS → browser", ms: 2, exchanges: 0 },
      { label: "Parse its parts", detail: "The address is split into the scheme, domain, path, query parameters, and fragment.", signal: "scheme · host · path · query", ms: 8, exchanges: 0 },
      { label: "HSTS", detail: "The browser checks whether it must upgrade HTTP to secure HTTPS before connecting.", signal: "http → HSTS → https", ms: 2, exchanges: 0 },
      { label: "Punycode", detail: "If the domain contains Unicode, it is converted to the ASCII form understood by DNS.", signal: "Unicode? → IDNA / xn--…", ms: 2, exchanges: 0 },
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
    key: "tcp", short: "TCP", title: "TCP connection", actor: "Network",
    substeps: [
      { label: "Open a socket", detail: "The browser asks the OS for a stream socket to the resolved IP address and port.", signal: "socket(AF_INET, SOCK_STREAM)", ms: 4, exchanges: 0 },
      { label: "ARP and gateway", detail: "The device resolves the MAC address of the next hop: the local server or its gateway.", signal: "ARP who-has → MAC", ms: 18, exchanges: 1 },
      { label: "SYN", detail: "The client proposes a connection and sends its initial sequence number.", signal: "client → SYN", ms: 40, exchanges: 1 },
      { label: "Routing", detail: "The IP packet carrying SYN crosses a sequence of routers on its way to the server network.", signal: "SYN packet → next hops", ms: 25, exchanges: 1 },
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
      { label: "Validate cache", detail: "The server decides whether to send fresh content or confirm that the browser's copy is current.", signal: "ETag → 304 or 200", ms: 10, exchanges: 0 },
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
      { label: "Render tree", detail: "Visible DOM nodes and their computed styles are combined into the render tree.", signal: "DOM + CSSOM → render tree", ms: 35, exchanges: 0 },
      { label: "Layout", detail: "The browser calculates the size, coordinates, and relative position of every visible box.", signal: "render tree → geometry", ms: 80, exchanges: 0 },
      { label: "Paint", detail: "The engine creates drawing commands for text, backgrounds, borders, and effects.", signal: "boxes → display list", ms: 45, exchanges: 0 },
      { label: "Rasterization", detail: "Drawing commands become pixel tiles, often with help from the GPU.", signal: "display list → tiles", ms: 45, exchanges: 0 },
      { label: "Compositing", detail: "The compositor assembles layers into the final frame and sends it to the display.", signal: "layers → composite → frame", ms: 25, exchanges: 0 },
      { label: "Interactivity", detail: "JavaScript and event handlers are ready to respond to the user.", signal: "DOMContentLoaded → interactive", ms: 40, exchanges: 0 },
    ],
  },
];

const englishCachedDnsSubsteps: Substep[] = [
  { label: "Cache hit", detail: "The browser immediately finds the saved DNS record and avoids an external network request.", signal: "browser DNS cache → 93.184.216.34", ms: 8, exchanges: 0 },
];

const englishSubstepPurpose: Record<string, string> = {
  "Enter the URL": "Starts navigation to the website",
  "Enter event": "Delivers the command to the active browser",
  "Parse its parts": "Identifies where the browser should connect",
  "HSTS": "Prevents an insecure initial request",
  "Punycode": "Prepares a Unicode domain for DNS",
  "Choose the port": "Selects the network endpoint",
  "Browser cache": "Avoids an external DNS request",
  "System cache": "Reuses a previously known address",
  "Recursive DNS": "Handles the address lookup for the client",
  "Root and TLD": "Finds the correct domain zone",
  "Authoritative DNS": "Returns the final IP address",
  "Cache hit": "Immediately returns the saved IP",
  "Open a socket": "Creates the network endpoint",
  "ARP and gateway": "Finds the next local-network hop",
  "Routing": "Carries the packet to the server network",
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
  "Validate cache": "Avoids retransmitting an unchanged resource",
  "Status and headers": "Explains the result to the browser",
  "Response body": "Transfers the page content",
  "Parse HTML": "Discovers the structure and dependencies",
  "CSS and JavaScript": "Adds presentation and behavior",
  "Images": "Fills the page with visual content",
  "DOM": "Creates the document structure",
  "CSSOM": "Creates the style model",
  "Render tree": "Keeps the content that must be drawn",
  "Layout": "Calculates sizes and positions",
  "Paint": "Describes the drawing order",
  "Rasterization": "Creates pixel tiles for layers",
  "Compositing": "Assembles the final frame",
  "Interactivity": "Makes the page responsive to input",
};

const russianTechnicalDetails: Record<string, string> = {
  "Ввод URL": "Навигация создаёт новый сетевой запрос в контексте текущей вкладки. Браузер также проверяет, является ли ввод URL, поисковым запросом или внутренней схемой.",
  "Событие Enter": "Контроллер физической клавиатуры или экранная клавиатура формирует код нажатия, который обрабатывает операционная система. Системная очередь событий направляет его активному окну, где браузер распознаёт команду навигации.",
  "Разбор частей": "URL разбирается по правилам WHATWG URL Standard. Схема определяет протокол, host — целевой узел, а path и query формируют адрес ресурса.",
  "HSTS": "Домен сверяется с динамической политикой и встроенным preload-списком HSTS. При совпадении схема меняется на HTTPS локально, поэтому небезопасный HTTP-запрос вообще не покидает устройство.",
  "Punycode": "DNS работает с ASCII-метками, поэтому Unicode-части имени нормализуются и кодируются в формате IDNA с префиксом xn--. Отображаемое пользователю имя при этом может остаться человекочитаемым.",
  "Выбор порта": "Если порт не указан явно, браузер подставляет стандартный порт схемы. Вместе с IP-адресом порт образует конечную точку сокета.",
  "Кеш браузера": "Записи хранятся в пределах TTL, полученного из DNS-ответа. Актуальная запись позволяет пропустить обращение к системному резолверу.",
  "Кеш системы": "ОС проверяет локальный кеш резолвера и статические правила файла hosts. Результат возвращается браузеру через системный API разрешения имён.",
  "Рекурсивный DNS": "Резолвер принимает рекурсивный запрос типа A или AAAA и продолжает поиск от имени клиента. Обычно DNS использует UDP-порт 53, а для больших ответов и отдельных случаев — TCP.",
  "Root и TLD": "Корневой сервер возвращает ссылку на серверы зоны верхнего уровня, а TLD-сервер — на авторитативные серверы домена. Финального IP-адреса сайта в этих ответах ещё нет.",
  "Авторитативный DNS": "Авторитативный сервер читает зону домена и возвращает запись A, AAAA или цепочку CNAME. Ответ содержит TTL, который ограничивает срок безопасного кеширования.",
  "Попадание в кеш": "Сохранённая запись используется, пока её TTL не истёк. Это убирает несколько сетевых обменов и сокращает задержку перед соединением.",
  "Открытие сокета": "Системный вызов создаёт TCP-сокет семейства IPv4 или IPv6 и выбирает временный исходящий порт. Ядро связывает его с IP-адресом назначения и портом 80 или 443.",
  "ARP и шлюз": "Перед отправкой Ethernet- или Wi-Fi-кадра хосту нужен канальный адрес следующего узла. Для IPv4 его ищут через кеш и широковещательный ARP-запрос; в IPv6 аналогичную задачу выполняет Neighbor Discovery.",
  "Маршрутизация": "Ядро добавляет IP-заголовок, а канальный уровень — адреса сетевых интерфейсов. Каждый маршрутизатор читает адрес назначения, уменьшает Hop Limit или TTL и передаёт пакет следующему узлу по своей таблице маршрутов.",
  "SYN": "TCP-сегмент содержит флаг SYN, начальный sequence number и параметры вроде MSS и window scale. Они запускают согласование надёжного байтового потока.",
  "SYN-ACK": "Сервер отвечает собственным sequence number и подтверждает номер клиента через ACK. Сетевой стек сервера также резервирует состояние для соединения.",
  "ACK": "Финальный ACK подтверждает sequence number сервера. После этого обе стороны переходят в состояние ESTABLISHED и могут передавать прикладные данные.",
  "Client Hello": "Сообщение содержит SNI, ALPN, список cipher suites и key share для TLS 1.3. ALPN позволяет в том же рукопожатии согласовать HTTP/2 или HTTP/1.1.",
  "Сертификат": "Сервер передаёт цепочку X.509-сертификатов и подпись параметров рукопожатия. Публичный ключ связывает доменное имя с владельцем соответствующего закрытого ключа.",
  "Проверка": "Браузер строит цепочку до доверенного корневого центра и проверяет подписи, срок действия и SAN домена. Ошибка любой проверки прерывает установку доверенного защищённого соединения.",
  "Сессионный ключ": "Стороны независимо вычисляют общий секрет из результатов обмена ключами. Из него выводятся симметричные ключи, которыми AEAD-алгоритм защищает конфиденциальность и целостность трафика.",
  "Метод и путь": "Стартовая строка задаёт HTTP-метод и request target. У GET обычно нет тела, поэтому ресурс определяется через path и query string.",
  "Заголовки": "Host выбирает виртуальный сервер, Accept описывает допустимые форматы, а Cookie переносит состояние сессии. Заголовки также управляют кешированием и согласованием контента.",
  "Отправка": "HTTP-данные упаковываются в TLS records, TCP-сегменты и IP-пакеты. Получатель подтверждает байты, а потерянные сегменты TCP передаёт повторно.",
  "Обработка": "Reverse proxy или веб-сервер сопоставляет host и path с маршрутом приложения. Обработчик может обратиться к кешу, базе данных или внешним сервисам перед формированием результата.",
  "Проверка кеша": "Браузер может передать If-None-Match с ETag или If-Modified-Since с датой сохранённой копии. Если ресурс не изменился, сервер отвечает 304 без тела; иначе возвращает новый ответ 200 с содержимым.",
  "Статус и заголовки": "Код состояния сообщает класс результата, а Content-Type определяет способ интерпретации тела. Cache-Control, ETag и Set-Cookie управляют кешем и состоянием клиента.",
  "Тело ответа": "Тело может передаваться с Content-Length, chunked encoding или потоково поверх HTTP/2. До парсинга браузер декодирует Content-Encoding, например gzip или Brotli.",
  "Парсинг HTML": "Токенизатор превращает байты в теги и текст, постепенно строя DOM. Preload scanner параллельно обнаруживает критические CSS, скрипты и изображения.",
  "CSS и JavaScript": "CSS может блокировать первый рендер, а обычный синхронный script — дальнейший разбор HTML. Атрибуты defer и async, а также module меняют порядок загрузки и выполнения JavaScript.",
  "Изображения": "Планировщик выбирает приоритет запросов с учётом видимости и loading=lazy. После загрузки формат декодируется в пиксели и может потребовать повторного расчёта layout.",
  "DOM": "Каждый элемент, атрибут и текстовый узел становится объектом в дереве документа. Изменения DOM через JavaScript могут инвалидировать стили и геометрию.",
  "CSSOM": "Парсер применяет каскад, наследование и специфичность к найденным правилам. Итоговые computed styles рассчитываются для элементов, участвующих в отображении.",
  "Render tree": "Движок сопоставляет DOM-узлам вычисленные стили и исключает элементы, не участвующие в визуальном выводе, например display: none. Получившееся дерево содержит объекты, геометрию которых нужно рассчитать и нарисовать.",
  "Layout": "Движок вычисляет геометрию боксов с учётом обычного потока, flex/grid и размеров viewport. Изменение геометрических свойств может запустить повторный layout.",
  "Paint": "Дерево обходится в порядке наложения, а для фона, текста, границ и эффектов формируется display list. На этом этапе описывается, что и в каком порядке рисовать, но пиксели ещё не обязательно созданы.",
  "Растеризация": "Большие слои делятся на тайлы, и команды display list превращаются в растровые текстуры. Работу могут выполнять CPU и растровые потоки, а GPU ускоряет обработку и хранение текстур.",
  "Композиция": "Композитор размещает готовые слои с учётом transform, opacity, прокрутки и перекрытий. Он может собрать новый кадр из прежних текстур без повторного layout и paint всей страницы.",
  "Интерактивность": "После выполнения нужных скриптов обработчики событий могут принимать ввод пользователя. Метрики вроде INP оценивают задержку между действием и следующим визуальным обновлением.",
};

const englishTechnicalDetails: Record<string, string> = {
  "Enter the URL": "Navigation creates a new request in the context of the current tab. The browser also decides whether the input is a URL, a search query, or an internal scheme.",
  "Enter event": "A physical keyboard controller or an on-screen keyboard produces an input code that the operating system processes. The system event queue delivers it to the focused window, where the browser recognizes a navigation command.",
  "Parse its parts": "The URL is parsed according to the WHATWG URL Standard. The scheme selects the protocol, the host identifies the destination, and the path and query identify the resource.",
  "HSTS": "The domain is checked against a learned policy and the browser's built-in HSTS preload list. On a match, the scheme is upgraded locally so an insecure HTTP request never leaves the device.",
  "Punycode": "DNS uses ASCII labels, so Unicode hostname parts are normalized and encoded through IDNA with the xn-- prefix. The browser may still display the human-readable form to the user.",
  "Choose the port": "If no port is written explicitly, the browser supplies the scheme's default. Together with the IP address, the port forms the socket endpoint.",
  "Browser cache": "Entries are stored only for the TTL supplied by the DNS response. A valid entry lets the browser skip the operating system resolver.",
  "System cache": "The OS checks its resolver cache and static hosts-file rules. It returns the result through the platform's name-resolution API.",
  "Recursive DNS": "The resolver accepts a recursive A or AAAA query and continues the lookup on the client's behalf. DNS commonly uses UDP port 53, with TCP used for larger responses and selected cases.",
  "Root and TLD": "A root server refers the resolver to the top-level-domain servers, and a TLD server refers it to the domain's authoritative servers. These referrals do not yet contain the website's final address.",
  "Authoritative DNS": "The authoritative server reads the domain zone and returns an A, AAAA, or CNAME chain. The response includes a TTL that limits how long it may be cached.",
  "Cache hit": "The saved record remains usable until its TTL expires. Reusing it removes several network round trips and shortens connection startup.",
  "Open a socket": "A system call creates an IPv4 or IPv6 TCP socket and selects an ephemeral source port. The kernel associates it with the destination address and port 80 or 443.",
  "ARP and gateway": "Before sending an Ethernet or Wi-Fi frame, the host needs the link-layer address of its next hop. IPv4 finds it through the cache and a broadcast ARP query; IPv6 uses Neighbor Discovery for the same purpose.",
  "Routing": "The kernel adds an IP header and the link layer adds interface addresses. Each router reads the destination, decreases the Hop Limit or TTL, and forwards the packet according to its routing table.",
  "SYN": "The TCP segment carries the SYN flag, an initial sequence number, and options such as MSS and window scaling. These values begin negotiation of a reliable byte stream.",
  "SYN-ACK": "The server returns its own sequence number and acknowledges the client's number. Its network stack also allocates state for the pending connection.",
  "ACK": "The final ACK confirms the server's sequence number. Both endpoints enter the ESTABLISHED state and may now exchange application data.",
  "Client Hello": "The message includes SNI, ALPN, cipher suites, and a TLS 1.3 key share. ALPN can select HTTP/2 or HTTP/1.1 during the same handshake.",
  "Certificate": "The server sends an X.509 certificate chain and a signature over the handshake parameters. Its public key links the domain name to possession of the corresponding private key.",
  "Verification": "The browser builds a chain to a trusted root and checks signatures, validity dates, and the domain SAN. Any failed check prevents a trusted secure connection.",
  "Session key": "Both peers independently derive the same shared secret from the key exchange. Symmetric traffic keys are then derived and used by an AEAD cipher to protect confidentiality and integrity.",
  "Method and path": "The request line defines the HTTP method and request target. A GET request usually has no body, so the resource is identified by its path and query string.",
  "Headers": "Host selects the virtual server, Accept describes supported representations, and Cookie carries session state. Headers also control caching and content negotiation.",
  "Send": "HTTP bytes are wrapped in TLS records, TCP segments, and IP packets. The receiver acknowledges bytes, while TCP retransmits data detected as lost.",
  "Process": "A reverse proxy or web server maps the host and path to an application route. The handler may query caches, databases, or external services before producing a result.",
  "Validate cache": "The browser may send If-None-Match with an ETag or If-Modified-Since with the stored copy's date. An unchanged resource produces a bodyless 304 response; otherwise the server sends fresh content with 200.",
  "Status and headers": "The status code identifies the result class, while Content-Type defines how to interpret the body. Cache-Control, ETag, and Set-Cookie manage caching and client state.",
  "Response body": "The body may use Content-Length, chunked transfer encoding, or HTTP/2 streaming. The browser decodes Content-Encoding such as gzip or Brotli before parsing the content.",
  "Parse HTML": "The tokenizer converts incoming bytes into tags and text while incrementally building the DOM. A preload scanner can discover critical CSS, scripts, and images in parallel.",
  "CSS and JavaScript": "CSS can block first render, while a normal synchronous script can pause HTML parsing. defer, async, and module change when JavaScript downloads and executes.",
  "Images": "The scheduler prioritizes requests using visibility and loading=lazy hints. After download, the format is decoded into pixels and may trigger another layout calculation.",
  "DOM": "Every element, attribute, and text node becomes an object in the document tree. JavaScript DOM changes can invalidate computed styles and geometry.",
  "CSSOM": "The parser applies cascade, inheritance, and specificity to the collected rules. Computed styles are resolved for elements that participate in rendering.",
  "Render tree": "The engine associates computed styles with DOM nodes and excludes content that does not participate in visual output, such as display: none. The result contains the objects whose geometry must be calculated and drawn.",
  "Layout": "The engine calculates box geometry using normal flow, flex/grid rules, and the viewport size. Changing geometric properties can trigger another layout pass.",
  "Paint": "The tree is walked in stacking order to create a display list for backgrounds, text, borders, and effects. This stage describes what to draw and in which order; it does not necessarily create pixels yet.",
  "Rasterization": "Large layers are divided into tiles, and display-list commands become raster textures. CPU raster threads may do the work, while the GPU accelerates processing and stores textures.",
  "Compositing": "The compositor positions prepared layers using transforms, opacity, scrolling, and overlap. It can assemble a new frame from existing textures without repeating layout and paint for the whole page.",
  "Interactivity": "Once required scripts have executed, event handlers can process user input. Metrics such as INP estimate the delay between an interaction and the next visual update.",
};

const uiCopy: Record<Locale, Record<string, string>> = {
  ru: {
    simulatorLabel: "Симулятор загрузки веб-страницы", parameters: "Параметры", websiteAddress: "Адрес сайта", stepMode: "ПОШАГОВО",
    dnsCache: "DNS-кеш", ipKnown: "IP уже известен", fullLookup: "Полный поиск", back: "← Назад",
    restart: "Сначала ↺", next: "Далее →", substepsOf: "из", substeps: "подшагов", loadingStages: "Этапы загрузки", goStage: "Перейти к этапу",
    stageSubsteps: "Подшаги этапа", goSubstep: "Перейти к подшагу", defaultPurpose: "Обеспечивает следующий этап",
    substepsPlaceholder: "Подшаги появятся после запуска", ready: "Готово", browser: "Браузер", pageReady: "Страница готова к работе",
    enterAddress: "Введите адрес и начните путь", doneDetail: "Пиксели отрисованы, обработчики событий активны — пользователь может взаимодействовать со страницей.",
    doneTechnical: "К этому моменту критические ресурсы обработаны, а главный поток способен принимать пользовательский ввод. Фоновая загрузка, lazy-ресурсы и последующие JavaScript-задачи при этом могут продолжаться.",
    introDetail: "Вы увидите не только большие этапы, но и каждый внутренний подшаг.",
    introTechnical: "На каждом подшаге ниже появятся конкретные протоколы, структуры данных и сетевые обмены. Значения времени условные и нужны для сравнения этапов, а не для измерения реального сайта.", conditionalTime: "Условное время",
    networkExchanges: "Сетевые обмены", currentNode: "Текущий узел", interactive: "Интерактив", milliseconds: "мс",
  },
  en: {
    simulatorLabel: "Web page loading simulator", parameters: "Parameters", websiteAddress: "Website address", stepMode: "STEP BY STEP",
    dnsCache: "DNS cache", ipKnown: "IP already known", fullLookup: "Full lookup", back: "← Back",
    restart: "Start over ↺", next: "Next →", substepsOf: "of", substeps: "substeps", loadingStages: "Loading stages", goStage: "Go to stage",
    stageSubsteps: "Substeps for", goSubstep: "Go to substep", defaultPurpose: "Enables the next stage",
    substepsPlaceholder: "Substeps will appear after you start", ready: "Ready", browser: "Browser", pageReady: "The page is ready",
    enterAddress: "Enter an address and start the journey", doneDetail: "Pixels are painted and event handlers are active, so the user can interact with the page.",
    doneTechnical: "At this point, critical resources have been processed and the main thread can accept user input. Background loading, lazy resources, and later JavaScript tasks may still continue.",
    introDetail: "You will see every major stage and each of its internal substeps.",
    introTechnical: "Each substep below names the concrete protocols, data structures, and network exchanges involved. Timing values are illustrative comparisons, not measurements of a real website.", conditionalTime: "Illustrative time",
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
    const technicalDetails = locale === "ru" ? russianTechnicalDetails : englishTechnicalDetails;
    const url = ref("https://example.com");
    const cache = ref(false);
    const current = ref(-1);
    const done = ref(false);
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
      current.value = -1;
      done.value = false;
    }

    function nextStep() {
      normalizeUrl();
      if (done.value) current.value = -1;
      done.value = false;
      if (current.value < route.value.length - 1) current.value += 1;
      else done.value = true;
    }

    function previousStep() {
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
        h("div", { class: "panel-kicker" }, [h("span", text.parameters), h("span", text.stepMode)]),
        h("label", { class: "field-label", for: "sim-url" }, text.websiteAddress),
        h("div", { class: "url-field" }, [
          h("span", { class: "lock-glyph", "aria-hidden": "true" }, secure.value ? "◆" : "◇"),
          h("input", {
            id: "sim-url", value: url.value, inputmode: "url", spellcheck: false,
            onInput: (event: Event) => url.value = (event.target as HTMLInputElement).value,
            onKeydown: (event: KeyboardEvent) => {
              if (event.key !== "Enter") return;
              nextStep();
            },
          }),
        ]),
        h("div", { class: "control-divider" }),
        h("div", { class: "control-row" }, [
          h("div", [h("strong", text.dnsCache), h("small", cache.value ? text.ipKnown : text.fullLookup)]),
          h("button", {
            type: "button", class: ["switch", cache.value && "is-on"], role: "switch", "aria-label": text.dnsCache, "aria-checked": cache.value,
            onClick: () => { cache.value = !cache.value; reset(); },
          }, h("span")),
        ]),
        h("div", { class: "manual-controls" }, [
          h("button", { type: "button", class: "manual-button", disabled: current.value < 0, onClick: previousStep }, text.back),
          h("button", { type: "button", class: "manual-button is-primary", onClick: nextStep }, done.value ? text.restart : text.next),
        ]),
        h("p", { class: "estimate" }, `${Math.min(current.value + 1, route.value.length)} ${text.substepsOf} ${route.value.length} ${text.substeps}`),
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
              h("p", { class: "event-summary" }, done.value ? text.doneDetail : activeUnit.value?.detail ?? text.introDetail),
              h("p", { class: "event-technical" }, done.value
                ? text.doneTechnical
                : activeUnit.value
                  ? technicalDetails[activeUnit.value.label]
                  : text.introTechnical),
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
