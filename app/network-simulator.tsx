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
    key: "input", short: "KEY", title: "Ввод и операционная система", actor: "Устройство и ОС",
    substeps: [
      { label: "Ввод URL", detail: "Пользователь набирает адрес, а браузер обновляет строку и подсказки.", signal: "keys → omnibox text", ms: 3, exchanges: 0 },
      { label: "Нажатие Enter", detail: "Физический переключатель или сенсорный экран регистрирует действие пользователя.", signal: "switch closes | touch detected", ms: 1, exchanges: 0 },
      { label: "HID-сигнал", detail: "Клавиатура превращает действие в отчёт HID с кодом нажатой клавиши.", signal: "input → HID usage code", ms: 1, exchanges: 0 },
      { label: "USB или Bluetooth", detail: "Отчёт доставляется компьютеру по USB polling или беспроводному каналу.", signal: "HID report → host controller", ms: 2, exchanges: 0 },
      { label: "Драйвер и прерывание", detail: "Контроллер и драйвер уведомляют ядро ОС о готовом событии ввода.", signal: "IRQ / event → kernel driver", ms: 1, exchanges: 0 },
      { label: "Очередь событий ОС", detail: "ОС преобразует scan code в платформенное событие и ставит его в очередь.", signal: "scan code → keydown event", ms: 1, exchanges: 0 },
      { label: "Активное окно", detail: "Window manager направляет событие окну и контролу адресной строки браузера.", signal: "focused window → omnibox", ms: 1, exchanges: 0 },
      { label: "Событие Enter", detail: "Браузер получает Enter и запускает алгоритм навигации.", signal: "keydown Enter → navigate", ms: 2, exchanges: 0 },
    ],
  },
  {
    key: "url", short: "URL", title: "Разбор адреса", actor: "Браузер",
    substeps: [
      { label: "Интерпретация ввода", detail: "Браузер отличает URL от поискового запроса и внутренней команды.", signal: "URL | search | browser scheme", ms: 2, exchanges: 0 },
      { label: "Разбор частей", detail: "Адрес делится на схему, домен, путь, параметры и фрагмент.", signal: "scheme · host · path · query", ms: 8, exchanges: 0 },
      { label: "HSTS", detail: "Браузер проверяет, нужно ли принудительно заменить HTTP на защищённый HTTPS.", signal: "http → HSTS → https", ms: 2, exchanges: 0 },
      { label: "Punycode", detail: "Если домен содержит Unicode, он переводится в ASCII-представление, понятное DNS.", signal: "Unicode? → IDNA / xn--…", ms: 2, exchanges: 0 },
      { label: "Выбор порта", detail: "Схема HTTPS указывает на порт 443, HTTP — на порт 80.", signal: "https → :443", ms: 7, exchanges: 0 },
      { label: "Service Worker", detail: "Активный Service Worker получает шанс ответить на навигацию без внешней сети.", signal: "fetch event → cache or network", ms: 4, exchanges: 0 },
    ],
  },
  {
    key: "dns", short: "DNS", title: "Поиск IP-адреса", actor: "DNS",
    substeps: [
      { label: "Кеш браузера", detail: "Сначала браузер проверяет, не знает ли он IP этого домена.", signal: "browser DNS cache → miss", ms: 8, exchanges: 0 },
      { label: "Кеш системы", detail: "Затем запрос проверяет DNS-кеш операционной системы и файл hosts.", signal: "OS cache / hosts → miss", ms: 12, exchanges: 0 },
      { label: "Выбор резолвера", detail: "Система или браузер выбирает обычный DNS, DoT или DoH-резолвер.", signal: "UDP/TCP 53 | DoT 853 | DoH 443", ms: 4, exchanges: 0 },
      { label: "DNS-запрос", detail: "Формируются запросы A, AAAA и при поддержке HTTPS-записи с уникальными ID.", signal: "QNAME · QTYPE · RD · EDNS", ms: 3, exchanges: 0 },
      { label: "Рекурсивный DNS", detail: "Запрос уходит роутеру или ближайшему DNS-резолверу провайдера.", signal: "client → recursive resolver", ms: 35, exchanges: 1 },
      { label: "Root и TLD", detail: "Резолвер узнаёт у корневого сервера, кто отвечает за доменную зону.", signal: "root → .com nameserver", ms: 55, exchanges: 1 },
      { label: "Авторитативный DNS", detail: "Авторитативный сервер возвращает финальную A- или AAAA-запись.", signal: "example.com → 93.184.216.34", ms: 70, exchanges: 1 },
      { label: "DNSSEC", detail: "При включённом DNSSEC резолвер проверяет криптографическую цепочку доверия.", signal: "DS → DNSKEY → RRSIG", ms: 12, exchanges: 0 },
      { label: "Happy Eyeballs", detail: "Клиент выбирает между IPv6 и IPv4, не ожидая долгого таймаута одного пути.", signal: "AAAA ∥ A → fastest path", ms: 10, exchanges: 0 },
    ],
  },
  {
    key: "lan", short: "LAN", title: "Локальная сеть", actor: "ОС и роутер",
    substeps: [
      { label: "Таблица маршрутов", detail: "Ядро выбирает интерфейс и следующий узел по таблице маршрутизации.", signal: "destination → route → interface", ms: 2, exchanges: 0 },
      { label: "Proxy или VPN", detail: "Политика устройства может направить запрос через proxy или зашифрованный туннель.", signal: "direct | proxy | VPN tunnel", ms: 3, exchanges: 0 },
      { label: "Кеш соседей", detail: "ОС проверяет, известен ли канальный адрес шлюза или локального сервера.", signal: "neighbor cache → hit or miss", ms: 2, exchanges: 0 },
      { label: "ARP или NDP", detail: "Для IPv4 используется ARP, а для IPv6 — Neighbor Discovery.", signal: "IP address → link-layer address", ms: 18, exchanges: 1 },
      { label: "Канальный кадр", detail: "IP-пакет упаковывается в Ethernet- или Wi-Fi-кадр для локальной передачи.", signal: "IP packet → L2 frame", ms: 3, exchanges: 0 },
      { label: "NAT и firewall", detail: "Домашний роутер может заменить исходный адрес и проверить правила фильтрации.", signal: "private IP:port → public mapping", ms: 5, exchanges: 0 },
    ],
  },
  {
    key: "physical", short: "PHY", title: "Физическая передача", actor: "Адаптер и канал",
    substeps: [
      { label: "Очередь сетевого адаптера", detail: "Ядро помещает кадр в transmit ring сетевой карты через DMA-буфер.", signal: "kernel buffer → NIC TX ring", ms: 2, exchanges: 0 },
      { label: "Физический сигнал", detail: "NIC кодирует биты в электрический, оптический или радиосигнал.", signal: "bits → copper / fiber / radio", ms: 2, exchanges: 0 },
      { label: "Switch или Wi-Fi AP", detail: "Коммутатор или точка доступа пересылает кадр к локальному шлюзу.", signal: "L2 forwarding → gateway", ms: 3, exchanges: 1 },
      { label: "Модем или ONT", detail: "Оборудование доступа преобразует локальный поток в формат линии провайдера.", signal: "Ethernet → DOCSIS / PON / radio", ms: 4, exchanges: 0 },
      { label: "Последняя миля", detail: "Сигнал проходит домашний, офисный или мобильный участок до сети оператора.", signal: "premises → ISP access network", ms: 12, exchanges: 1 },
    ],
  },
  {
    key: "ip", short: "IP", title: "Путь через интернет", actor: "Маршрутизаторы",
    substeps: [
      { label: "IP-заголовок", detail: "Сетевой уровень добавляет адреса, класс трафика и предел числа переходов.", signal: "src · dst · protocol · TTL", ms: 2, exchanges: 0 },
      { label: "MTU и PMTUD", detail: "Размер пакетов подстраивается под минимальную MTU на всём пути.", signal: "packet size ≤ path MTU", ms: 4, exchanges: 0 },
      { label: "Маршрутизаторы", detail: "Каждый узел выбирает следующий hop по наиболее подходящему префиксу.", signal: "longest prefix match → next hop", ms: 25, exchanges: 2 },
      { label: "BGP и Anycast", detail: "Междоменные маршруты и Anycast направляют запрос к подходящей точке присутствия.", signal: "IP prefix → nearest announced PoP", ms: 8, exchanges: 0 },
      { label: "TTL / Hop Limit", detail: "На каждом переходе счётчик уменьшается, предотвращая бесконечные петли.", signal: "hop limit − 1", ms: 2, exchanges: 0 },
    ],
  },
  {
    key: "tcp", short: "L4", title: "Транспорт", actor: "TCP или QUIC",
    substeps: [
      { label: "Выбор транспорта", detail: "Клиент выбирает TCP для HTTP/1.1 или HTTP/2 либо QUIC для HTTP/3.", signal: "ALPN / HTTPS RR / Alt-Svc", ms: 3, exchanges: 0 },
      { label: "Открытие сокета", detail: "ОС создаёт TCP stream socket или UDP datagram socket для выбранного транспорта.", signal: "SOCK_STREAM | SOCK_DGRAM", ms: 4, exchanges: 0 },
      { label: "SYN", detail: "Клиент предлагает установить соединение и отправляет начальный номер последовательности.", signal: "client → SYN", ms: 40, exchanges: 1 },
      { label: "SYN-ACK", detail: "Сервер принимает предложение и подтверждает готовность к обмену.", signal: "server → SYN-ACK", ms: 40, exchanges: 1 },
      { label: "ACK", detail: "Клиент подтверждает ответ — надёжное TCP-соединение установлено.", signal: "client → ACK · connected", ms: 40, exchanges: 1 },
      { label: "Надёжность TCP", detail: "Номера последовательности, ACK и таймеры обеспечивают порядок и повторную передачу.", signal: "SEQ · ACK · retransmit", ms: 5, exchanges: 0 },
      { label: "Контроль перегрузки", detail: "Окно отправки растёт или уменьшается по сигналам состояния сети.", signal: "cwnd · RTT · loss / ECN", ms: 5, exchanges: 0 },
      { label: "QUIC / HTTP/3", detail: "Альтернативный путь объединяет транспорт, TLS 1.3 и независимые потоки поверх UDP.", signal: "UDP → QUIC streams + TLS 1.3", ms: 35, exchanges: 1 },
      { label: "Повторное соединение", detail: "Пул соединений, session resumption или QUIC 0-RTT сокращают новый запуск.", signal: "reuse | resume | 0-RTT", ms: 2, exchanges: 0 },
    ],
  },
  {
    key: "tls", short: "TLS", title: "Защищённый канал", actor: "TLS",
    substeps: [
      { label: "Client Hello", detail: "Браузер сообщает поддерживаемые версии TLS, шифры и случайные данные.", signal: "ClientHello · TLS 1.3", ms: 35, exchanges: 1 },
      { label: "SNI и ALPN", detail: "Клиент указывает имя сервера и предлагает HTTP/2, HTTP/1.1 или HTTP/3.", signal: "SNI · ALPN h2/http1.1/h3", ms: 2, exchanges: 0 },
      { label: "Server Hello", detail: "Сервер выбирает параметры и публикует свою долю эфемерного ключа.", signal: "ServerHello · key_share", ms: 20, exchanges: 1 },
      { label: "Сертификат", detail: "Сервер выбирает параметры и отправляет сертификат со своим публичным ключом.", signal: "ServerHello + Certificate", ms: 45, exchanges: 1 },
      { label: "Проверка", detail: "Браузер проверяет домен, срок действия и цепочку доверия сертификата.", signal: "CA chain → verified", ms: 35, exchanges: 0 },
      { label: "Статус сертификата", detail: "OCSP, stapling и Certificate Transparency дают дополнительные сигналы доверия.", signal: "OCSP staple · SCT · revocation", ms: 8, exchanges: 0 },
      { label: "Сессионный ключ", detail: "Стороны получают общий секрет — дальнейший трафик будет зашифрован.", signal: "session keys → encrypted", ms: 45, exchanges: 1 },
      { label: "Finished", detail: "Обе стороны подтверждают целостность рукопожатия и переходят к application data.", signal: "Finished ↔ Finished", ms: 15, exchanges: 1 },
      { label: "Возобновление TLS", detail: "Session ticket позволяет следующему соединению выполнить сокращённое рукопожатие.", signal: "PSK ticket → resumed session", ms: 2, exchanges: 0 },
    ],
  },
  {
    key: "http", short: "GET", title: "HTTP-запрос", actor: "HTTP",
    substeps: [
      { label: "Метод и путь", detail: "Браузер формирует стартовую строку запроса с методом GET и путём.", signal: "GET / HTTP/1.1", ms: 8, exchanges: 0 },
      { label: "Версия HTTP", detail: "HTTP/1.1 использует текстовую стартовую строку, HTTP/2 и HTTP/3 — бинарные фреймы.", signal: "HTTP/1.1 | HEADERS frame", ms: 3, exchanges: 0 },
      { label: "Заголовки", detail: "Добавляются Host, User-Agent, Accept-Language, Cookie и другие заголовки.", signal: "Host · Accept · Cookie", ms: 12, exchanges: 0 },
      { label: "Cookie и авторизация", detail: "К запросу могут добавиться сессионные cookie и данные авторизации.", signal: "Cookie · Authorization · CSRF", ms: 4, exchanges: 0 },
      { label: "Тело запроса", detail: "Для POST или PUT данные кодируются согласно Content-Type и политике origin.", signal: "JSON | form-data | stream", ms: 4, exchanges: 0 },
      { label: "Отправка", detail: "Готовый запрос уходит по согласованному защищённому транспортному соединению.", signal: "encrypted request → server", ms: 20, exchanges: 1 },
    ],
  },
  {
    key: "edge", short: "EDGE", title: "Пограничная инфраструктура", actor: "CDN и reverse proxy",
    substeps: [
      { label: "Точка присутствия", detail: "Anycast или DNS направляет запрос в ближайший доступный CDN PoP.", signal: "client → edge PoP", ms: 18, exchanges: 1 },
      { label: "Защита DDoS", detail: "Пограничная сеть отсеивает аномальный трафик и ограничивает частоту запросов.", signal: "traffic profile → allow / rate-limit", ms: 3, exchanges: 0 },
      { label: "WAF", detail: "Web Application Firewall проверяет запрос по правилам атак и политике приложения.", signal: "request → managed rules", ms: 5, exchanges: 0 },
      { label: "TLS termination", detail: "CDN или балансировщик может завершить TLS и открыть новое защищённое соединение к origin.", signal: "client TLS → edge → origin TLS", ms: 8, exchanges: 1 },
      { label: "Балансировщик", detail: "Запрос распределяется по здоровым серверам с учётом нагрузки и региона.", signal: "health checks → backend pool", ms: 4, exchanges: 0 },
      { label: "Edge-кеш", detail: "Готовый ответ может вернуться из CDN-кеша без обращения к приложению.", signal: "cache key → HIT or MISS", ms: 6, exchanges: 0 },
    ],
  },
  {
    key: "server-os", short: "KERN", title: "Ядро сервера", actor: "Серверная ОС",
    substeps: [
      { label: "Приём на NIC", detail: "Сетевая карта сервера проверяет кадр и помещает данные в receive ring.", signal: "wire → NIC RX ring", ms: 2, exchanges: 0 },
      { label: "DMA и interrupt", detail: "DMA переносит данные в память, а interrupt или polling будит сетевой стек.", signal: "DMA → RAM · IRQ / NAPI", ms: 2, exchanges: 0 },
      { label: "Сетевой стек ядра", detail: "Ядро снимает L2/IP/transport-заголовки и проверяет контрольные данные.", signal: "frame → IP → TCP / UDP", ms: 3, exchanges: 0 },
      { label: "Conntrack и фильтры", detail: "Состояние соединения и локальные firewall-правила проверяются ещё раз.", signal: "packet → conntrack → policy", ms: 2, exchanges: 0 },
      { label: "Socket buffer", detail: "Полезные данные помещаются в receive buffer соответствующего сокета.", signal: "flow tuple → socket queue", ms: 2, exchanges: 0 },
      { label: "Accept queue", detail: "Новое TCP-соединение переходит из SYN backlog в очередь accept приложения.", signal: "SYN queue → accept queue", ms: 3, exchanges: 0 },
      { label: "Event notification", detail: "epoll, kqueue или IOCP сообщает runtime, что сокет готов к чтению.", signal: "socket ready → event loop", ms: 2, exchanges: 0 },
      { label: "Планировщик ОС", detail: "Scheduler выделяет CPU потоку или процессу, который обработает запрос.", signal: "runnable task → CPU core", ms: 3, exchanges: 0 },
    ],
  },
  {
    key: "backend", short: "APP", title: "Сервер и приложение", actor: "Backend",
    substeps: [
      { label: "Виртуальный хост", detail: "Веб-сервер выбирает конфигурацию сайта по имени хоста и порту.", signal: "host:port → virtual server", ms: 3, exchanges: 0 },
      { label: "Rewrite и роутинг", detail: "URL нормализуется и сопоставляется с маршрутом приложения.", signal: "method + path → handler", ms: 5, exchanges: 0 },
      { label: "Middleware", detail: "Промежуточные обработчики выполняют логирование, CORS, лимиты и проверку сессии.", signal: "request → middleware chain", ms: 8, exchanges: 0 },
      { label: "Бизнес-логика", detail: "Обработчик проверяет правила продукта и формирует необходимые операции.", signal: "handler → domain logic", ms: 20, exchanges: 0 },
      { label: "Кеш приложения", detail: "Процесс проверяет локальный или распределённый кеш вычисленных данных.", signal: "cache key → Redis / memory", ms: 6, exchanges: 1 },
      { label: "База данных", detail: "При промахе кеша приложение выполняет запрос и ждёт план выполнения и I/O.", signal: "SQL / index → rows", ms: 35, exchanges: 1 },
      { label: "Внешние сервисы", detail: "Приложение может обратиться к другим API, очередям или микросервисам.", signal: "service → API / queue", ms: 30, exchanges: 1 },
      { label: "SSR или шаблон", detail: "Данные превращаются в HTML, JSON, поток RSC или другой формат ответа.", signal: "data → representation", ms: 18, exchanges: 0 },
    ],
  },
  {
    key: "response", short: "200", title: "Ответ сервера", actor: "Сервер",
    substeps: [
      { label: "Обработка", detail: "Веб-сервер находит ресурс и подготавливает ответ клиенту.", signal: "route → document", ms: 75, exchanges: 0 },
      { label: "Проверка кеша", detail: "Сервер решает, вернуть новое содержимое или подтвердить актуальность копии браузера.", signal: "ETag → 304 or 200", ms: 10, exchanges: 0 },
      { label: "Статус и заголовки", detail: "Первыми приходят статус 200 OK, Content-Type, Cache-Control и cookies.", signal: "200 OK · text/html", ms: 35, exchanges: 1 },
      { label: "Сжатие", detail: "Представление может сжиматься Brotli, gzip или Zstandard по Accept-Encoding.", signal: "content → br / gzip / zstd", ms: 8, exchanges: 0 },
      { label: "Фрейминг ответа", detail: "Длина, чанки или DATA-фреймы задают границы и потоковую передачу тела.", signal: "Content-Length | chunks | DATA", ms: 4, exchanges: 0 },
      { label: "Тело ответа", detail: "HTML-документ передаётся частями; браузер может начать работу до конца загрузки.", signal: "HTML byte stream → browser", ms: 50, exchanges: 1 },
    ],
  },
  {
    key: "assets", short: "RES", title: "Загрузка ресурсов", actor: "Браузер",
    substeps: [
      { label: "Парсинг HTML", detail: "Поток HTML разбирается сверху вниз, и браузер обнаруживает ссылки на ресурсы.", signal: "HTML tokenizer → tags", ms: 55, exchanges: 0 },
      { label: "Preload scanner", detail: "Спекулятивный сканер заранее находит CSS, скрипты, шрифты и изображения.", signal: "HTML bytes → early requests", ms: 8, exchanges: 0 },
      { label: "CSS и JavaScript", detail: "Стили, скрипты и шрифты получают собственные приоритетные запросы.", signal: "CSS · JS · FONT", ms: 95, exchanges: 2 },
      { label: "Выполнение скриптов", detail: "Обычные, async, defer и module-скрипты запускаются в разном порядке.", signal: "parser-blocking | async | defer", ms: 35, exchanges: 0 },
      { label: "Веб-шрифты", detail: "Шрифты выбираются, загружаются, проверяются и превращаются в глифы.", signal: "@font-face → font matching", ms: 45, exchanges: 1 },
      { label: "Изображения", detail: "Изображения загружаются параллельно и декодируются перед отображением.", signal: "IMG requests → decode", ms: 100, exchanges: 2 },
      { label: "Другие origin", detail: "Для стороннего домена могут повториться DNS, соединение, TLS и CORS-проверка.", signal: "new origin → DNS + connect + CORS", ms: 40, exchanges: 2 },
    ],
  },
  {
    key: "runtime", short: "JS", title: "Runtime страницы", actor: "JavaScript engine",
    substeps: [
      { label: "Декодирование байтов", detail: "Content-Type, BOM и правила HTML определяют кодировку входного потока.", signal: "bytes + charset → Unicode", ms: 8, exchanges: 0 },
      { label: "Парсинг JavaScript", detail: "JavaScript engine токенизирует исходник и строит синтаксическое представление.", signal: "source → tokens → AST", ms: 15, exchanges: 0 },
      { label: "Bytecode и JIT", detail: "Код компилируется в bytecode, а горячие участки могут оптимизироваться JIT.", signal: "AST → bytecode → optimized code", ms: 25, exchanges: 0 },
      { label: "Web APIs", detail: "DOM, fetch, timers и события выполняются совместно с подсистемами браузера.", signal: "JS ↔ browser APIs", ms: 8, exchanges: 0 },
      { label: "Event loop", detail: "Очереди задач и микрозадач координируют JavaScript, события и обновление кадра.", signal: "task → microtasks → render", ms: 12, exchanges: 0 },
      { label: "Garbage collection", detail: "Сборщик памяти находит недостижимые объекты и освобождает их память.", signal: "heap graph → reclaim", ms: 10, exchanges: 0 },
      { label: "Workers", detail: "Web Workers и Worklets выполняют подходящие задачи вне главного потока.", signal: "main thread ↔ worker", ms: 5, exchanges: 0 },
    ],
  },
  {
    key: "render", short: "PIX", title: "Рендеринг страницы", actor: "Рендер",
    substeps: [
      { label: "DOM", detail: "Из HTML строится дерево элементов документа — DOM.", signal: "HTML → DOM tree", ms: 65, exchanges: 0 },
      { label: "CSSOM", detail: "Правила CSS разбираются и превращаются в дерево стилей CSSOM.", signal: "CSS → CSSOM", ms: 65, exchanges: 0 },
      { label: "Дерево доступности", detail: "Семантика DOM и ARIA превращается в платформенное дерево для assistive technologies.", signal: "DOM + ARIA → AX tree", ms: 12, exchanges: 0 },
      { label: "Recalculate Style", detail: "Каскад, наследование и селекторы определяют computed style каждого элемента.", signal: "DOM × CSS rules → computed style", ms: 35, exchanges: 0 },
      { label: "Render tree", detail: "Видимые DOM-узлы и вычисленные стили объединяются в дерево рендеринга.", signal: "DOM + CSSOM → render tree", ms: 35, exchanges: 0 },
      { label: "Layout", detail: "Браузер вычисляет размеры, координаты и взаимное расположение всех видимых боксов.", signal: "render tree → geometry", ms: 80, exchanges: 0 },
      { label: "Формирование текста", detail: "Unicode-текст, направление письма и fallback-шрифты превращаются в позиционированные глифы.", signal: "text + fonts → glyph runs", ms: 18, exchanges: 0 },
      { label: "Paint", detail: "Движок создаёт список команд рисования для текста, фонов, границ и эффектов.", signal: "boxes → display list", ms: 45, exchanges: 0 },
      { label: "Растеризация", detail: "Команды рисования превращаются в пиксельные тайлы, часто с участием GPU.", signal: "display list → tiles", ms: 45, exchanges: 0 },
      { label: "Композиция", detail: "Композитор собирает слои в финальный кадр и отправляет его на экран.", signal: "layers → composite → frame", ms: 25, exchanges: 0 },
      { label: "Интерактивность", detail: "JavaScript и обработчики событий готовы реагировать на действия пользователя.", signal: "DOMContentLoaded → interactive", ms: 40, exchanges: 0 },
    ],
  },
  {
    key: "lifecycle", short: "LIFE", title: "После первого кадра", actor: "Страница и сеть",
    substeps: [
      { label: "DOMContentLoaded", detail: "HTML разобран, defer/module-скрипты выполнены, и документ становится interactive.", signal: "readyState → interactive", ms: 5, exchanges: 0 },
      { label: "Событие load", detail: "После критических зависимых ресурсов браузер переводит документ в complete.", signal: "readyState → complete · load", ms: 8, exchanges: 0 },
      { label: "Lazy и фоновые ресурсы", detail: "Ленивая загрузка, аналитика и фоновые запросы продолжаются после первого кадра.", signal: "idle → lazy fetches", ms: 20, exchanges: 1 },
      { label: "Обработка ввода", detail: "Событие пользователя проходит hit testing, обработчик, обновление состояния и новый кадр.", signal: "input → handler → present", ms: 16, exchanges: 0 },
      { label: "Keep-Alive", detail: "Соединения остаются в пуле для следующих запросов, пока не истечёт timeout.", signal: "idle connection → reuse", ms: 2, exchanges: 0 },
      { label: "Закрытие соединения", detail: "TCP использует FIN/ACK, а QUIC отправляет CONNECTION_CLOSE или истекает по таймауту.", signal: "FIN ↔ ACK | QUIC close", ms: 8, exchanges: 1 },
      { label: "Обновление кешей", detail: "HTTP-кеш, DNS-кеш и Service Worker сохраняют данные с собственными сроками жизни.", signal: "response metadata → caches", ms: 4, exchanges: 0 },
      { label: "Метрики и телеметрия", detail: "Performance API и серверные traces фиксируют задержки, ошибки и зависимые операции.", signal: "timings + trace context → telemetry", ms: 3, exchanges: 0 },
    ],
  },
];

const russianCachedDnsSubsteps: Substep[] = [
  { label: "Попадание в кеш", detail: "Браузер сразу находит сохранённую DNS-запись и не обращается во внешнюю сеть.", signal: "browser DNS cache → 93.184.216.34", ms: 8, exchanges: 0 },
  { label: "Happy Eyeballs", detail: "Даже для кешированных адресов клиент выбирает наиболее быстрое соединение IPv6 или IPv4.", signal: "cached AAAA ∥ A → fastest path", ms: 10, exchanges: 0 },
];

const russianSubstepPurpose: Record<string, string> = {
  "Ввод URL": "Запускает переход к сайту",
  "HID-сигнал": "Преобразует действие в системный ввод",
  "Событие Enter": "Передаёт команду активному браузеру",
  "Интерпретация ввода": "Определяет дальнейшее действие браузера",
  "Разбор частей": "Помогает понять, куда обращаться",
  "HSTS": "Не допускает небезопасный первый запрос",
  "Punycode": "Готовит Unicode-домен для DNS",
  "Выбор порта": "Определяет точку подключения",
  "Service Worker": "Может перехватить запрос локально",
  "Кеш браузера": "Экономит внешний DNS-запрос",
  "Кеш системы": "Повторно использует известный адрес",
  "Выбор резолвера": "Определяет транспорт и доверенную сторону DNS",
  "DNS-запрос": "Описывает нужное имя и тип данных",
  "Рекурсивный DNS": "Берёт поиск адреса на себя",
  "Root и TLD": "Находит нужную доменную зону",
  "Авторитативный DNS": "Даёт окончательный IP-адрес",
  "DNSSEC": "Проверяет подлинность DNS-данных",
  "Happy Eyeballs": "Выбирает рабочий IP-стек без задержки",
  "Попадание в кеш": "Сразу возвращает сохранённый IP",
  "Таблица маршрутов": "Выбирает локальный выход к цели",
  "Proxy или VPN": "Меняет границу и маршрут соединения",
  "Кеш соседей": "Переиспользует известный адрес канального уровня",
  "ARP или NDP": "Находит адрес следующего узла",
  "Канальный кадр": "Переносит пакет по локальной сети",
  "NAT и firewall": "Транслирует и фильтрует соединение",
  "IP-заголовок": "Адресует пакет между сетями",
  "MTU и PMTUD": "Не даёт пакету превысить размер пути",
  "Маршрутизаторы": "Передают пакет между сетями",
  "BGP и Anycast": "Выбирает межсетевой путь и точку присутствия",
  "TTL / Hop Limit": "Останавливает маршрутные петли",
  "Открытие сокета": "Создаёт сетевую конечную точку",
  "Выбор транспорта": "Выбирает TCP или QUIC",
  "SYN": "Предлагает открыть соединение",
  "SYN-ACK": "Подтверждает готовность сервера",
  "ACK": "Завершает установку TCP-канала",
  "Надёжность TCP": "Сохраняет порядок и восстанавливает потери",
  "Контроль перегрузки": "Не перегружает доступную сеть",
  "QUIC / HTTP/3": "Даёт защищённые независимые потоки поверх UDP",
  "Повторное соединение": "Сокращает повторный запуск",
  "Client Hello": "Согласует возможности шифрования",
  "SNI и ALPN": "Выбирает домен и прикладной протокол",
  "Server Hello": "Фиксирует параметры TLS и ключевой обмен",
  "Сертификат": "Доказывает подлинность сервера",
  "Проверка": "Защищает от подмены сайта",
  "Статус сертификата": "Проверяет дополнительные сигналы доверия",
  "Сессионный ключ": "Шифрует дальнейший обмен",
  "Finished": "Подтверждает целостность рукопожатия",
  "Возобновление TLS": "Ускоряет следующие соединения",
  "Метод и путь": "Говорит, какой ресурс нужен",
  "Версия HTTP": "Определяет формат обмена",
  "Заголовки": "Передают контекст запроса",
  "Cookie и авторизация": "Связывает запрос с сессией и правами",
  "Тело запроса": "Передаёт данные операции",
  "Отправка": "Доставляет запрос серверу",
  "Точка присутствия": "Принимает запрос ближе к пользователю",
  "Защита DDoS": "Сдерживает аномальный поток трафика",
  "WAF": "Блокирует известные веб-атаки",
  "TLS termination": "Разделяет клиентское и origin-соединения",
  "Балансировщик": "Выбирает здоровый backend",
  "Edge-кеш": "Отдаёт готовый ответ без origin",
  "Виртуальный хост": "Выбирает конфигурацию нужного сайта",
  "Rewrite и роутинг": "Находит обработчик запроса",
  "Middleware": "Применяет общие политики приложения",
  "Бизнес-логика": "Выполняет продуктовые правила",
  "Кеш приложения": "Избегает повторных вычислений",
  "База данных": "Получает постоянные данные",
  "Внешние сервисы": "Подключает зависимые системы",
  "SSR или шаблон": "Формирует представление ответа",
  "Обработка": "Находит и готовит результат",
  "Проверка кеша": "Избегает повторной передачи ресурса",
  "Статус и заголовки": "Объясняет результат браузеру",
  "Сжатие": "Уменьшает объём передачи",
  "Фрейминг ответа": "Разделяет поток на передаваемые части",
  "Тело ответа": "Передаёт содержимое страницы",
  "Парсинг HTML": "Находит структуру и зависимости",
  "Preload scanner": "Начинает критические загрузки раньше",
  "CSS и JavaScript": "Добавляет стиль и поведение",
  "Выполнение скриптов": "Запускает код в предусмотренном порядке",
  "Веб-шрифты": "Готовит глифы для текста",
  "Изображения": "Наполняет страницу медиаконтентом",
  "Другие origin": "Загружает сторонние зависимости безопасно",
  "DOM": "Создаёт структуру документа",
  "CSSOM": "Создаёт модель стилей",
  "Recalculate Style": "Вычисляет итоговые стили элементов",
  "Render tree": "Оставляет видимое для отрисовки",
  "Layout": "Рассчитывает размеры и позиции",
  "Paint": "Описывает порядок рисования",
  "Растеризация": "Создаёт пиксельные тайлы слоёв",
  "Композиция": "Собирает финальный кадр",
  "Event loop": "Координирует код, события и кадры",
  "Интерактивность": "Делает страницу управляемой",
  "Нажатие Enter": "Фиксирует физическое действие пользователя",
  "USB или Bluetooth": "Доставляет HID-отчёт операционной системе",
  "Драйвер и прерывание": "Передаёт ввод из контроллера в ядро",
  "Очередь событий ОС": "Превращает scan code в событие клавиши",
  "Активное окно": "Направляет ввод нужному приложению",
  "Очередь сетевого адаптера": "Передаёт кадр сетевой карте",
  "Физический сигнал": "Переносит биты по реальному каналу",
  "Switch или Wi-Fi AP": "Доставляет кадр локальному шлюзу",
  "Модем или ONT": "Согласует домашнюю сеть с линией провайдера",
  "Последняя миля": "Соединяет помещение с сетью оператора",
  "Приём на NIC": "Принимает и проверяет кадр на сервере",
  "DMA и interrupt": "Доставляет пакет из адаптера в память",
  "Сетевой стек ядра": "Разбирает протоколы и находит соединение",
  "Conntrack и фильтры": "Проверяет состояние и локальную политику",
  "Socket buffer": "Ставит байты в очередь приложения",
  "Accept queue": "Передаёт новое соединение серверу",
  "Event notification": "Будит runtime при готовности сокета",
  "Планировщик ОС": "Выделяет процессор обработчику",
  "Декодирование байтов": "Превращает ответ в Unicode-текст",
  "Парсинг JavaScript": "Строит исполняемое представление кода",
  "Bytecode и JIT": "Ускоряет выполнение горячего кода",
  "Web APIs": "Связывает JavaScript с браузером",
  "Garbage collection": "Возвращает память недостижимых объектов",
  "Workers": "Выносит работу из главного потока",
  "Дерево доступности": "Открывает интерфейс assistive technologies",
  "Формирование текста": "Превращает символы в глифы",
  "DOMContentLoaded": "Сообщает о готовности DOM и defer-скриптов",
  "Событие load": "Сообщает о завершении основных зависимостей",
  "Lazy и фоновые ресурсы": "Продолжает некритическую загрузку",
  "Обработка ввода": "Превращает действие в обновлённый кадр",
  "Keep-Alive": "Переиспользует дорогое соединение",
  "Закрытие соединения": "Освобождает транспортное состояние",
  "Обновление кешей": "Сохраняет данные для следующих навигаций",
  "Метрики и телеметрия": "Делает путь измеримым и диагностируемым",
};

const englishStages: Stage[] = [
  {
    key: "input", short: "KEY", title: "Input and operating system", actor: "Device and OS",
    substeps: [
      { label: "Enter the URL", detail: "The user types an address while the browser updates the omnibox and suggestions.", signal: "keys → omnibox text", ms: 3, exchanges: 0 },
      { label: "Press Enter", detail: "A physical switch or touch surface registers the user's action.", signal: "switch closes | touch detected", ms: 1, exchanges: 0 },
      { label: "HID signal", detail: "The keyboard converts the action into a HID report containing the pressed key code.", signal: "input → HID usage code", ms: 1, exchanges: 0 },
      { label: "USB or Bluetooth", detail: "The HID report reaches the computer through USB polling or a wireless link.", signal: "HID report → host controller", ms: 2, exchanges: 0 },
      { label: "Driver and interrupt", detail: "The controller and driver notify the operating-system kernel that input is ready.", signal: "IRQ / event → kernel driver", ms: 1, exchanges: 0 },
      { label: "OS event queue", detail: "The OS maps the scan code to a platform event and places it in a queue.", signal: "scan code → keydown event", ms: 1, exchanges: 0 },
      { label: "Focused window", detail: "The window manager routes the event to the browser's focused omnibox control.", signal: "focused window → omnibox", ms: 1, exchanges: 0 },
      { label: "Enter event", detail: "The browser receives Enter and starts its navigation algorithm.", signal: "keydown Enter → navigate", ms: 2, exchanges: 0 },
    ],
  },
  {
    key: "url", short: "URL", title: "Parse the address", actor: "Browser",
    substeps: [
      { label: "Interpret input", detail: "The browser distinguishes a URL from a search query or an internal command.", signal: "URL | search | browser scheme", ms: 2, exchanges: 0 },
      { label: "Parse its parts", detail: "The address is split into the scheme, domain, path, query parameters, and fragment.", signal: "scheme · host · path · query", ms: 8, exchanges: 0 },
      { label: "HSTS", detail: "The browser checks whether it must upgrade HTTP to secure HTTPS before connecting.", signal: "http → HSTS → https", ms: 2, exchanges: 0 },
      { label: "Punycode", detail: "If the domain contains Unicode, it is converted to the ASCII form understood by DNS.", signal: "Unicode? → IDNA / xn--…", ms: 2, exchanges: 0 },
      { label: "Choose the port", detail: "HTTPS uses port 443 by default, while HTTP uses port 80.", signal: "https → :443", ms: 7, exchanges: 0 },
      { label: "Service Worker", detail: "An active Service Worker gets a chance to answer the navigation without the external network.", signal: "fetch event → cache or network", ms: 4, exchanges: 0 },
    ],
  },
  {
    key: "dns", short: "DNS", title: "Find the IP address", actor: "DNS",
    substeps: [
      { label: "Browser cache", detail: "The browser first checks whether it already knows the IP address for this domain.", signal: "browser DNS cache → miss", ms: 8, exchanges: 0 },
      { label: "System cache", detail: "Next, the operating system checks its DNS cache and hosts file.", signal: "OS cache / hosts → miss", ms: 12, exchanges: 0 },
      { label: "Select resolver", detail: "The system or browser selects classic DNS, a DoT resolver, or a DoH resolver.", signal: "UDP/TCP 53 | DoT 853 | DoH 443", ms: 4, exchanges: 0 },
      { label: "DNS query", detail: "Queries for A, AAAA, and, when supported, HTTPS records are created with transaction IDs.", signal: "QNAME · QTYPE · RD · EDNS", ms: 3, exchanges: 0 },
      { label: "Recursive DNS", detail: "The request goes to the router or the nearest recursive DNS resolver.", signal: "client → recursive resolver", ms: 35, exchanges: 1 },
      { label: "Root and TLD", detail: "The resolver asks a root server which name server is responsible for the domain zone.", signal: "root → .com nameserver", ms: 55, exchanges: 1 },
      { label: "Authoritative DNS", detail: "The authoritative server returns the final A or AAAA record.", signal: "example.com → 93.184.216.34", ms: 70, exchanges: 1 },
      { label: "DNSSEC", detail: "When DNSSEC is enabled, the resolver validates a cryptographic chain of trust.", signal: "DS → DNSKEY → RRSIG", ms: 12, exchanges: 0 },
      { label: "Happy Eyeballs", detail: "The client chooses between IPv6 and IPv4 without waiting for one path to time out.", signal: "AAAA ∥ A → fastest path", ms: 10, exchanges: 0 },
    ],
  },
  {
    key: "lan", short: "LAN", title: "Local network", actor: "OS and router",
    substeps: [
      { label: "Routing table", detail: "The kernel selects an interface and next hop from its local routing table.", signal: "destination → route → interface", ms: 2, exchanges: 0 },
      { label: "Proxy or VPN", detail: "Device policy can send the request through a proxy or an encrypted tunnel.", signal: "direct | proxy | VPN tunnel", ms: 3, exchanges: 0 },
      { label: "Neighbor cache", detail: "The OS checks whether the gateway's or local server's link-layer address is known.", signal: "neighbor cache → hit or miss", ms: 2, exchanges: 0 },
      { label: "ARP or NDP", detail: "IPv4 uses ARP, while IPv6 uses Neighbor Discovery.", signal: "IP address → link-layer address", ms: 18, exchanges: 1 },
      { label: "Link-layer frame", detail: "The IP packet is wrapped in an Ethernet or Wi-Fi frame for local delivery.", signal: "IP packet → L2 frame", ms: 3, exchanges: 0 },
      { label: "NAT and firewall", detail: "A home router may replace the source address and evaluate filtering rules.", signal: "private IP:port → public mapping", ms: 5, exchanges: 0 },
    ],
  },
  {
    key: "physical", short: "PHY", title: "Physical transmission", actor: "Adapter and medium",
    substeps: [
      { label: "Network adapter queue", detail: "The kernel places the frame in the network adapter's transmit ring through a DMA buffer.", signal: "kernel buffer → NIC TX ring", ms: 2, exchanges: 0 },
      { label: "Physical signal", detail: "The NIC encodes bits as electrical, optical, or radio signals.", signal: "bits → copper / fiber / radio", ms: 2, exchanges: 0 },
      { label: "Switch or Wi-Fi AP", detail: "A switch or access point forwards the frame toward the local gateway.", signal: "L2 forwarding → gateway", ms: 3, exchanges: 1 },
      { label: "Modem or ONT", detail: "Access equipment converts the local stream into the provider line format.", signal: "Ethernet → DOCSIS / PON / radio", ms: 4, exchanges: 0 },
      { label: "Last mile", detail: "The signal crosses the home, office, or mobile access segment into the operator network.", signal: "premises → ISP access network", ms: 12, exchanges: 1 },
    ],
  },
  {
    key: "ip", short: "IP", title: "Across the internet", actor: "Routers",
    substeps: [
      { label: "IP header", detail: "The network layer adds addresses, traffic class, and a hop limit.", signal: "src · dst · protocol · TTL", ms: 2, exchanges: 0 },
      { label: "MTU and PMTUD", detail: "Packet sizes adapt to the smallest MTU along the end-to-end path.", signal: "packet size ≤ path MTU", ms: 4, exchanges: 0 },
      { label: "Routers", detail: "Each node selects a next hop using the most specific matching prefix.", signal: "longest prefix match → next hop", ms: 25, exchanges: 2 },
      { label: "BGP and Anycast", detail: "Interdomain routes and Anycast direct the request to a suitable point of presence.", signal: "IP prefix → nearest announced PoP", ms: 8, exchanges: 0 },
      { label: "TTL / Hop Limit", detail: "Every hop decrements a counter that prevents forwarding loops from lasting forever.", signal: "hop limit − 1", ms: 2, exchanges: 0 },
    ],
  },
  {
    key: "tcp", short: "L4", title: "Transport", actor: "TCP or QUIC",
    substeps: [
      { label: "Choose transport", detail: "The client selects TCP for HTTP/1.1 or HTTP/2, or QUIC for HTTP/3.", signal: "ALPN / HTTPS RR / Alt-Svc", ms: 3, exchanges: 0 },
      { label: "Open a socket", detail: "The OS creates a TCP stream socket or UDP datagram socket for the chosen transport.", signal: "SOCK_STREAM | SOCK_DGRAM", ms: 4, exchanges: 0 },
      { label: "SYN", detail: "The client proposes a connection and sends its initial sequence number.", signal: "client → SYN", ms: 40, exchanges: 1 },
      { label: "SYN-ACK", detail: "The server accepts the proposal and confirms that it is ready to communicate.", signal: "server → SYN-ACK", ms: 40, exchanges: 1 },
      { label: "ACK", detail: "The client acknowledges the response, completing the reliable TCP connection.", signal: "client → ACK · connected", ms: 40, exchanges: 1 },
      { label: "TCP reliability", detail: "Sequence numbers, acknowledgements, and timers provide ordering and retransmission.", signal: "SEQ · ACK · retransmit", ms: 5, exchanges: 0 },
      { label: "Congestion control", detail: "The sender grows or shrinks its flight size based on network feedback.", signal: "cwnd · RTT · loss / ECN", ms: 5, exchanges: 0 },
      { label: "QUIC / HTTP/3", detail: "An alternative path combines transport, TLS 1.3, and independent streams over UDP.", signal: "UDP → QUIC streams + TLS 1.3", ms: 35, exchanges: 1 },
      { label: "Connection reuse", detail: "Connection pools, session resumption, or QUIC 0-RTT reduce later startup cost.", signal: "reuse | resume | 0-RTT", ms: 2, exchanges: 0 },
    ],
  },
  {
    key: "tls", short: "TLS", title: "Secure the channel", actor: "TLS",
    substeps: [
      { label: "Client Hello", detail: "The browser announces its supported TLS versions, cipher suites, and random data.", signal: "ClientHello · TLS 1.3", ms: 35, exchanges: 1 },
      { label: "SNI and ALPN", detail: "The client names the server and offers HTTP/2, HTTP/1.1, or HTTP/3.", signal: "SNI · ALPN h2/http1.1/h3", ms: 2, exchanges: 0 },
      { label: "Server Hello", detail: "The server selects parameters and publishes its ephemeral key share.", signal: "ServerHello · key_share", ms: 20, exchanges: 1 },
      { label: "Certificate", detail: "The server chooses the parameters and sends a certificate containing its public key.", signal: "ServerHello + Certificate", ms: 45, exchanges: 1 },
      { label: "Verification", detail: "The browser verifies the domain, expiry date, and certificate trust chain.", signal: "CA chain → verified", ms: 35, exchanges: 0 },
      { label: "Certificate status", detail: "OCSP, stapling, and Certificate Transparency provide additional trust signals.", signal: "OCSP staple · SCT · revocation", ms: 8, exchanges: 0 },
      { label: "Session key", detail: "Both sides derive a shared secret so that subsequent traffic is encrypted.", signal: "session keys → encrypted", ms: 45, exchanges: 1 },
      { label: "Finished", detail: "Both peers authenticate the handshake transcript and switch to application data.", signal: "Finished ↔ Finished", ms: 15, exchanges: 1 },
      { label: "TLS resumption", detail: "A session ticket allows a later connection to use a shortened handshake.", signal: "PSK ticket → resumed session", ms: 2, exchanges: 0 },
    ],
  },
  {
    key: "http", short: "GET", title: "Send the HTTP request", actor: "HTTP",
    substeps: [
      { label: "Method and path", detail: "The browser builds the request line with the GET method and resource path.", signal: "GET / HTTP/1.1", ms: 8, exchanges: 0 },
      { label: "HTTP version", detail: "HTTP/1.1 uses a textual start line; HTTP/2 and HTTP/3 use binary frames.", signal: "HTTP/1.1 | HEADERS frame", ms: 3, exchanges: 0 },
      { label: "Headers", detail: "Host, User-Agent, Accept-Language, Cookie, and other headers add request context.", signal: "Host · Accept · Cookie", ms: 12, exchanges: 0 },
      { label: "Cookies and auth", detail: "Session cookies and authorization data may be attached to the request.", signal: "Cookie · Authorization · CSRF", ms: 4, exchanges: 0 },
      { label: "Request body", detail: "POST or PUT data is encoded according to Content-Type and origin policy.", signal: "JSON | form-data | stream", ms: 4, exchanges: 0 },
      { label: "Send", detail: "The finished request travels over the negotiated secure transport connection.", signal: "encrypted request → server", ms: 20, exchanges: 1 },
    ],
  },
  {
    key: "edge", short: "EDGE", title: "Edge infrastructure", actor: "CDN and reverse proxy",
    substeps: [
      { label: "Point of presence", detail: "Anycast or DNS directs the request to a nearby available CDN PoP.", signal: "client → edge PoP", ms: 18, exchanges: 1 },
      { label: "DDoS protection", detail: "The edge network filters anomalous traffic and applies rate limits.", signal: "traffic profile → allow / rate-limit", ms: 3, exchanges: 0 },
      { label: "WAF", detail: "A Web Application Firewall evaluates attack signatures and application policy.", signal: "request → managed rules", ms: 5, exchanges: 0 },
      { label: "TLS termination", detail: "A CDN or load balancer can end client TLS and open a new secure connection to origin.", signal: "client TLS → edge → origin TLS", ms: 8, exchanges: 1 },
      { label: "Load balancer", detail: "The request is assigned to a healthy server using load and region information.", signal: "health checks → backend pool", ms: 4, exchanges: 0 },
      { label: "Edge cache", detail: "A complete response may return from CDN cache without reaching the application.", signal: "cache key → HIT or MISS", ms: 6, exchanges: 0 },
    ],
  },
  {
    key: "server-os", short: "KERN", title: "Server kernel", actor: "Server OS",
    substeps: [
      { label: "NIC receive", detail: "The server network adapter validates the frame and places data in a receive ring.", signal: "wire → NIC RX ring", ms: 2, exchanges: 0 },
      { label: "DMA and interrupt", detail: "DMA transfers data into memory while an interrupt or polling wakes the network stack.", signal: "DMA → RAM · IRQ / NAPI", ms: 2, exchanges: 0 },
      { label: "Kernel network stack", detail: "The kernel removes link, IP, and transport headers and validates their metadata.", signal: "frame → IP → TCP / UDP", ms: 3, exchanges: 0 },
      { label: "Conntrack and filters", detail: "Connection state and local firewall policy are evaluated before delivery.", signal: "packet → conntrack → policy", ms: 2, exchanges: 0 },
      { label: "Socket buffer", detail: "Payload bytes enter the receive buffer of the socket selected by the flow tuple.", signal: "flow tuple → socket queue", ms: 2, exchanges: 0 },
      { label: "Accept queue", detail: "A new TCP connection moves from the SYN backlog into the application's accept queue.", signal: "SYN queue → accept queue", ms: 3, exchanges: 0 },
      { label: "Event notification", detail: "epoll, kqueue, or IOCP tells the runtime that the socket can be read.", signal: "socket ready → event loop", ms: 2, exchanges: 0 },
      { label: "OS scheduler", detail: "The scheduler gives a worker thread CPU time to process the request.", signal: "runnable thread → CPU", ms: 2, exchanges: 0 },
    ],
  },
  {
    key: "backend", short: "APP", title: "Server and application", actor: "Backend",
    substeps: [
      { label: "Virtual host", detail: "The web server chooses site configuration using the host name and port.", signal: "host:port → virtual server", ms: 3, exchanges: 0 },
      { label: "Rewrite and routing", detail: "The URL is normalized and matched to an application route.", signal: "method + path → handler", ms: 5, exchanges: 0 },
      { label: "Middleware", detail: "Intermediate handlers perform logging, CORS, limits, and session checks.", signal: "request → middleware chain", ms: 8, exchanges: 0 },
      { label: "Business logic", detail: "The handler evaluates product rules and decides which operations are needed.", signal: "handler → domain logic", ms: 20, exchanges: 0 },
      { label: "Application cache", detail: "The process checks a local or distributed cache for computed data.", signal: "cache key → Redis / memory", ms: 6, exchanges: 1 },
      { label: "Database", detail: "After a cache miss, the application runs a query and waits for planning and I/O.", signal: "SQL / index → rows", ms: 35, exchanges: 1 },
      { label: "External services", detail: "The application may call other APIs, queues, or microservices.", signal: "service → API / queue", ms: 30, exchanges: 1 },
      { label: "SSR or template", detail: "Data becomes HTML, JSON, an RSC stream, or another response representation.", signal: "data → representation", ms: 18, exchanges: 0 },
    ],
  },
  {
    key: "response", short: "200", title: "Receive the response", actor: "Server",
    substeps: [
      { label: "Process", detail: "The web server locates the resource and prepares the response for the client.", signal: "route → document", ms: 75, exchanges: 0 },
      { label: "Validate cache", detail: "The server decides whether to send fresh content or confirm that the browser's copy is current.", signal: "ETag → 304 or 200", ms: 10, exchanges: 0 },
      { label: "Status and headers", detail: "The browser first receives 200 OK, Content-Type, Cache-Control, cookies, and other headers.", signal: "200 OK · text/html", ms: 35, exchanges: 1 },
      { label: "Compression", detail: "The representation may use Brotli, gzip, or Zstandard according to Accept-Encoding.", signal: "content → br / gzip / zstd", ms: 8, exchanges: 0 },
      { label: "Response framing", detail: "A length, chunks, or DATA frames define boundaries and streaming of the body.", signal: "Content-Length | chunks | DATA", ms: 4, exchanges: 0 },
      { label: "Response body", detail: "The HTML arrives in chunks, so the browser can start working before the download ends.", signal: "HTML byte stream → browser", ms: 50, exchanges: 1 },
    ],
  },
  {
    key: "assets", short: "RES", title: "Load resources", actor: "Browser",
    substeps: [
      { label: "Parse HTML", detail: "The browser parses the HTML stream from top to bottom and discovers linked resources.", signal: "HTML tokenizer → tags", ms: 55, exchanges: 0 },
      { label: "Preload scanner", detail: "A speculative scanner discovers CSS, scripts, fonts, and images early.", signal: "HTML bytes → early requests", ms: 8, exchanges: 0 },
      { label: "CSS and JavaScript", detail: "Stylesheets, scripts, and fonts receive their own prioritized requests.", signal: "CSS · JS · FONT", ms: 95, exchanges: 2 },
      { label: "Execute scripts", detail: "Classic, async, defer, and module scripts run at different points in parsing.", signal: "parser-blocking | async | defer", ms: 35, exchanges: 0 },
      { label: "Web fonts", detail: "Fonts are selected, downloaded, sanitized, and converted into glyphs.", signal: "@font-face → font matching", ms: 45, exchanges: 1 },
      { label: "Images", detail: "Images load in parallel and are decoded before they can be displayed.", signal: "IMG requests → decode", ms: 100, exchanges: 2 },
      { label: "Other origins", detail: "A third-party origin can repeat DNS, connection, TLS, and CORS processing.", signal: "new origin → DNS + connect + CORS", ms: 40, exchanges: 2 },
    ],
  },
  {
    key: "runtime", short: "JS", title: "Page runtime", actor: "JavaScript engine",
    substeps: [
      { label: "Decode bytes", detail: "The browser converts response bytes into Unicode text using the selected encoding.", signal: "bytes + charset → Unicode", ms: 4, exchanges: 0 },
      { label: "Parse JavaScript", detail: "The engine tokenizes source code, checks syntax, and builds its internal representation.", signal: "source → tokens → AST", ms: 12, exchanges: 0 },
      { label: "Bytecode and JIT", detail: "Code starts in an interpreter and hot paths may be compiled into optimized machine code.", signal: "AST → bytecode → machine code", ms: 18, exchanges: 0 },
      { label: "Web APIs", detail: "Browser-provided APIs connect JavaScript to timers, networking, storage, and the DOM.", signal: "JS call → browser process", ms: 6, exchanges: 0 },
      { label: "Event loop", detail: "Task and microtask queues coordinate JavaScript, events, and frame updates.", signal: "task → microtasks → render", ms: 12, exchanges: 0 },
      { label: "Garbage collection", detail: "The engine traces unreachable objects and reclaims their memory.", signal: "heap graph → reclaim", ms: 8, exchanges: 0 },
      { label: "Workers", detail: "Dedicated and Service Workers run separate event loops outside the page's main thread.", signal: "main thread ↔ worker", ms: 8, exchanges: 0 },
    ],
  },
  {
    key: "render", short: "PIX", title: "Render the page", actor: "Renderer",
    substeps: [
      { label: "DOM", detail: "The browser turns the HTML into the document object model, or DOM.", signal: "HTML → DOM tree", ms: 65, exchanges: 0 },
      { label: "CSSOM", detail: "CSS rules are parsed into a separate style model called the CSSOM.", signal: "CSS → CSSOM", ms: 65, exchanges: 0 },
      { label: "Accessibility tree", detail: "DOM semantics and ARIA become a platform tree for assistive technologies.", signal: "DOM + ARIA → AX tree", ms: 12, exchanges: 0 },
      { label: "Recalculate Style", detail: "Cascade, inheritance, and selectors determine each element's computed style.", signal: "DOM × CSS rules → computed style", ms: 35, exchanges: 0 },
      { label: "Render tree", detail: "Visible DOM nodes and their computed styles are combined into the render tree.", signal: "DOM + CSSOM → render tree", ms: 35, exchanges: 0 },
      { label: "Layout", detail: "The browser calculates the size, coordinates, and relative position of every visible box.", signal: "render tree → geometry", ms: 80, exchanges: 0 },
      { label: "Text shaping", detail: "Unicode text, direction, scripts, and fallback fonts are converted into positioned glyphs.", signal: "text + fonts → glyph runs", ms: 18, exchanges: 0 },
      { label: "Paint", detail: "The engine creates drawing commands for text, backgrounds, borders, and effects.", signal: "boxes → display list", ms: 45, exchanges: 0 },
      { label: "Rasterization", detail: "Drawing commands become pixel tiles, often with help from the GPU.", signal: "display list → tiles", ms: 45, exchanges: 0 },
      { label: "Compositing", detail: "The compositor assembles layers into the final frame and sends it to the display.", signal: "layers → composite → frame", ms: 25, exchanges: 0 },
      { label: "Interactivity", detail: "JavaScript and event handlers are ready to respond to the user.", signal: "DOMContentLoaded → interactive", ms: 40, exchanges: 0 },
    ],
  },
  {
    key: "lifecycle", short: "LIFE", title: "After the first frame", actor: "Page and network",
    substeps: [
      { label: "DOMContentLoaded", detail: "The document announces that parsing and blocking deferred scripts have completed.", signal: "document → DOMContentLoaded", ms: 4, exchanges: 0 },
      { label: "load event", detail: "The window announces that required dependent resources have finished loading.", signal: "resources complete → load", ms: 20, exchanges: 0 },
      { label: "Lazy and background resources", detail: "Lazy media, analytics, prefetching, and background work continue by priority.", signal: "idle / viewport → more work", ms: 25, exchanges: 1 },
      { label: "Process input", detail: "Hit testing and DOM event dispatch turn later clicks or keys into application behavior.", signal: "input → handler → frame", ms: 8, exchanges: 0 },
      { label: "Keep-Alive", detail: "Connection pools keep TCP, HTTP/2, or QUIC sessions ready for more requests.", signal: "connection → idle pool", ms: 2, exchanges: 0 },
      { label: "Close connection", detail: "Idle timeouts or explicit shutdown eventually release transport state at both ends.", signal: "FIN / CONNECTION_CLOSE", ms: 6, exchanges: 1 },
      { label: "Update caches", detail: "The browser stores reusable responses and metadata according to cache policy.", signal: "response → memory / disk cache", ms: 5, exchanges: 0 },
      { label: "Metrics and telemetry", detail: "Performance entries, traces, and logs record what happened for diagnostics.", signal: "timings → RUM / traces", ms: 4, exchanges: 0 },
    ],
  },
];

const englishCachedDnsSubsteps: Substep[] = [
  { label: "Cache hit", detail: "The browser immediately finds the saved DNS record and avoids an external network request.", signal: "browser DNS cache → 93.184.216.34", ms: 8, exchanges: 0 },
  { label: "Happy Eyeballs", detail: "Even with cached addresses, the client selects the fastest usable IPv6 or IPv4 connection.", signal: "cached AAAA ∥ A → fastest path", ms: 10, exchanges: 0 },
];

const englishSubstepPurpose: Record<string, string> = {
  "Enter the URL": "Starts navigation to the website",
  "HID signal": "Turns the action into system input",
  "Enter event": "Delivers the command to the active browser",
  "Interpret input": "Determines the browser's next action",
  "Parse its parts": "Identifies where the browser should connect",
  "HSTS": "Prevents an insecure initial request",
  "Punycode": "Prepares a Unicode domain for DNS",
  "Choose the port": "Selects the network endpoint",
  "Service Worker": "Can intercept navigation locally",
  "Browser cache": "Avoids an external DNS request",
  "System cache": "Reuses a previously known address",
  "Select resolver": "Chooses DNS transport and trust boundary",
  "DNS query": "Names the requested data and record type",
  "Recursive DNS": "Handles the address lookup for the client",
  "Root and TLD": "Finds the correct domain zone",
  "Authoritative DNS": "Returns the final IP address",
  "DNSSEC": "Authenticates DNS data",
  "Happy Eyeballs": "Selects a working IP stack quickly",
  "Cache hit": "Immediately returns the saved IP",
  "Routing table": "Chooses the local path to the destination",
  "Proxy or VPN": "Changes the connection path and trust boundary",
  "Neighbor cache": "Reuses a known link-layer address",
  "ARP or NDP": "Finds the next hop's address",
  "Link-layer frame": "Carries the packet across the local link",
  "NAT and firewall": "Translates and filters the connection",
  "IP header": "Addresses a packet between networks",
  "MTU and PMTUD": "Keeps packets within the path size",
  "Routers": "Forward the packet between networks",
  "BGP and Anycast": "Selects an interdomain path and PoP",
  "TTL / Hop Limit": "Stops routing loops",
  "Open a socket": "Creates the network endpoint",
  "Choose transport": "Selects TCP or QUIC",
  "SYN": "Proposes opening a connection",
  "SYN-ACK": "Confirms that the server is ready",
  "ACK": "Completes the TCP connection",
  "TCP reliability": "Preserves order and recovers losses",
  "Congestion control": "Avoids overwhelming the network",
  "QUIC / HTTP/3": "Provides secure independent streams over UDP",
  "Connection reuse": "Reduces later startup cost",
  "Client Hello": "Negotiates encryption capabilities",
  "SNI and ALPN": "Selects the domain and application protocol",
  "Server Hello": "Fixes TLS parameters and key exchange",
  "Certificate": "Proves the server's identity",
  "Verification": "Protects against website impersonation",
  "Certificate status": "Checks additional trust signals",
  "Session key": "Encrypts the rest of the exchange",
  "Finished": "Authenticates the handshake transcript",
  "TLS resumption": "Speeds up later connections",
  "Method and path": "Specifies which resource is needed",
  "HTTP version": "Determines the wire format",
  "Headers": "Provide context for the request",
  "Cookies and auth": "Associates the request with state and permissions",
  "Request body": "Carries operation data",
  "Send": "Delivers the request to the server",
  "Point of presence": "Accepts the request near the user",
  "DDoS protection": "Controls anomalous traffic volume",
  "WAF": "Blocks known web attacks",
  "TLS termination": "Separates client and origin connections",
  "Load balancer": "Chooses a healthy backend",
  "Edge cache": "Returns a response without origin",
  "Virtual host": "Selects the requested site configuration",
  "Rewrite and routing": "Finds the request handler",
  "Middleware": "Applies shared application policies",
  "Business logic": "Executes product rules",
  "Application cache": "Avoids repeated computation",
  "Database": "Retrieves durable data",
  "External services": "Connects dependent systems",
  "SSR or template": "Builds the response representation",
  "Process": "Finds and prepares the result",
  "Validate cache": "Avoids retransmitting an unchanged resource",
  "Status and headers": "Explains the result to the browser",
  "Compression": "Reduces transferred bytes",
  "Response framing": "Divides the response stream into parts",
  "Response body": "Transfers the page content",
  "Parse HTML": "Discovers the structure and dependencies",
  "Preload scanner": "Starts critical downloads earlier",
  "CSS and JavaScript": "Adds presentation and behavior",
  "Execute scripts": "Runs code at the intended point",
  "Web fonts": "Prepares glyphs for text",
  "Images": "Fills the page with visual content",
  "Other origins": "Loads third-party dependencies safely",
  "DOM": "Creates the document structure",
  "CSSOM": "Creates the style model",
  "Recalculate Style": "Computes final element styles",
  "Render tree": "Keeps the content that must be drawn",
  "Layout": "Calculates sizes and positions",
  "Paint": "Describes the drawing order",
  "Rasterization": "Creates pixel tiles for layers",
  "Compositing": "Assembles the final frame",
  "Event loop": "Coordinates code, events, and frames",
  "Interactivity": "Makes the page responsive to input",
  "Press Enter": "Captures the user's physical action",
  "USB or Bluetooth": "Carries the HID report to the operating system",
  "Driver and interrupt": "Moves input from the controller into the kernel",
  "OS event queue": "Turns a scan code into a key event",
  "Focused window": "Routes input to the intended application",
  "Network adapter queue": "Hands the frame to the network adapter",
  "Physical signal": "Carries bits over a real medium",
  "Switch or Wi-Fi AP": "Delivers the frame to the local gateway",
  "Modem or ONT": "Bridges the local network and provider line",
  "Last mile": "Connects the premises to the operator network",
  "NIC receive": "Accepts and validates the frame at the server",
  "DMA and interrupt": "Moves the packet from adapter to memory",
  "Kernel network stack": "Decapsulates protocols and finds the flow",
  "Conntrack and filters": "Applies state tracking and local policy",
  "Socket buffer": "Queues bytes for the application",
  "Accept queue": "Hands a new connection to the server",
  "Event notification": "Wakes the runtime when a socket is ready",
  "OS scheduler": "Allocates CPU time to a handler",
  "Decode bytes": "Converts the response into Unicode text",
  "Parse JavaScript": "Builds an executable representation of code",
  "Bytecode and JIT": "Accelerates frequently executed code",
  "Web APIs": "Connects JavaScript to browser capabilities",
  "Garbage collection": "Reclaims unreachable object memory",
  "Workers": "Moves work off the main thread",
  "Accessibility tree": "Exposes the interface to assistive technology",
  "Text shaping": "Turns characters into positioned glyphs",
  "DOMContentLoaded": "Signals that the DOM and deferred scripts are ready",
  "load event": "Signals completion of primary dependencies",
  "Lazy and background resources": "Continues non-critical loading",
  "Process input": "Turns an action into an updated frame",
  "Keep-Alive": "Reuses an expensive connection",
  "Close connection": "Releases transport state",
  "Update caches": "Stores data for later navigations",
  "Metrics and telemetry": "Makes the path measurable and diagnosable",
};

const russianTechnicalDetails: Record<string, string> = {
  "Ввод URL": "Навигация создаёт новый сетевой запрос в контексте текущей вкладки. Браузер также проверяет, является ли ввод URL, поисковым запросом или внутренней схемой.",
  "HID-сигнал": "Контроллер физической клавиатуры формирует HID report со scan code, а экранная клавиатура создаёт эквивалентное программное событие из координат касания. Драйвер и ядро ОС преобразуют низкоуровневый ввод в платформенное событие клавиши, не привязанное к конкретной модели устройства.",
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
  "Открытие сокета": "Для HTTP/1.1 или HTTP/2 системный вызов создаёт TCP SOCK_STREAM, а для QUIC — UDP SOCK_DGRAM; семейство адресов будет IPv4 или IPv6. Ядро выбирает временный исходящий порт и связывает endpoint с адресом и портом назначения.",
  "ARP и шлюз": "Перед отправкой Ethernet- или Wi-Fi-кадра хосту нужен канальный адрес следующего узла. Для IPv4 его ищут через кеш и широковещательный ARP-запрос; в IPv6 аналогичную задачу выполняет Neighbor Discovery.",
  "Маршрутизация": "Ядро добавляет IP-заголовок, а канальный уровень — адреса сетевых интерфейсов. Каждый маршрутизатор читает адрес назначения, уменьшает Hop Limit или TTL и передаёт пакет следующему узлу по своей таблице маршрутов.",
  "SYN": "TCP-сегмент содержит флаг SYN, начальный sequence number и параметры вроде MSS и window scale. Они запускают согласование надёжного байтового потока.",
  "SYN-ACK": "Сервер отвечает собственным sequence number и подтверждает номер клиента через ACK. Сетевой стек сервера также резервирует состояние для соединения.",
  "ACK": "Финальный ACK подтверждает sequence number сервера. После этого обе стороны переходят в состояние ESTABLISHED и могут передавать прикладные данные.",
  "Client Hello": "Сообщение содержит SNI, ALPN, список cipher suites и key share для TLS 1.3. ALPN позволяет в том же рукопожатии согласовать HTTP/2 или HTTP/1.1.",
  "Сертификат": "Сервер передаёт цепочку X.509-сертификатов и подпись параметров рукопожатия. Публичный ключ связывает доменное имя с владельцем соответствующего закрытого ключа.",
  "Проверка": "Браузер строит цепочку до доверенного корневого центра и проверяет подписи, срок действия и SAN домена. Ошибка любой проверки прерывает установку доверенного защищённого соединения.",
  "Статус сертификата": "Сервер может вложить OCSP response через stapling, чтобы клиент не выполнял отдельный запрос к CA; CRL и локальные механизмы браузера дополняют проверку отзыва. Signed Certificate Timestamps подтверждают публикацию сертификата в журналах Certificate Transparency, но политика обработки ошибок зависит от клиента.",
  "Сессионный ключ": "Стороны независимо вычисляют общий секрет из результатов обмена ключами. Из него выводятся симметричные ключи, которыми AEAD-алгоритм защищает конфиденциальность и целостность трафика.",
  "Метод и путь": "В HTTP/1.1 стартовая строка задаёт метод и request target, а в HTTP/2/3 ту же семантику несут псевдозаголовки :method, :scheme, :authority и :path. У GET обычно нет тела, поэтому ресурс определяется через path и query string.",
  "Заголовки": "Host выбирает виртуальный сервер, Accept описывает допустимые форматы, а Cookie переносит состояние сессии. Заголовки также управляют кешированием и согласованием контента.",
  "Отправка": "При HTTP/1.1 или HTTP/2 данные проходят через TLS records, TCP-сегменты и IP-пакеты; HTTP/3 кодирует их во фреймы QUIC streams внутри UDP datagram. Надёжность, flow control и повторная передача выполняются TCP либо самим QUIC.",
  "Обработка": "Reverse proxy или веб-сервер сопоставляет host и path с маршрутом приложения. Обработчик может обратиться к кешу, базе данных или внешним сервисам перед формированием результата.",
  "Проверка кеша": "Браузер может передать If-None-Match с ETag или If-Modified-Since с датой сохранённой копии. Если ресурс не изменился, сервер отвечает 304 без тела; иначе возвращает новый ответ 200 с содержимым.",
  "Статус и заголовки": "Код состояния сообщает класс результата, а Content-Type определяет способ интерпретации тела. Cache-Control, ETag и Set-Cookie управляют кешем и состоянием клиента.",
  "Тело ответа": "Тело может иметь Content-Length, chunked encoding в HTTP/1.1 или идти DATA-фреймами потока HTTP/2/3. До парсинга браузер декодирует Content-Encoding, например gzip, Brotli или Zstandard.",
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
  "Интерпретация ввода": "Omnibox применяет эвристики к строке и её контексту: схеме, пробелам, истории и политике поисковой системы. Результатом становится либо URL навигации, либо URL поискового запроса, либо внутренняя команда браузера.",
  "Service Worker": "Для контролируемого origin событие fetch передаётся Service Worker, который может вернуть Response из Cache Storage, построить его программно или продолжить сетевой запрос. Это отдельный механизм от HTTP-кеша и он работает только в разрешённой области регистрации.",
  "Выбор резолвера": "Классический stub resolver обычно обращается к адресу, полученному через DHCP или RA, по UDP/TCP 53. Браузер или ОС могут вместо этого использовать DoT на 853 или DoH как HTTPS-обмен на 443, скрывая содержимое запроса от наблюдателей пути.",
  "DNS-запрос": "Сообщение содержит заголовок с ID и флагами, секцию Question с QNAME/QTYPE/QCLASS и часто EDNS(0). Современный клиент параллельно интересуется A, AAAA и HTTPS/SVCB, где могут находиться ALPN, альтернативный порт и подсказки адресов.",
  "DNSSEC": "Валидирующий резолвер проверяет RRSIG публичным DNSKEY и связывает ключ зоны с родителем через DS-запись. DNSSEC подтверждает происхождение и целостность данных, но не шифрует сам DNS-трафик.",
  "Happy Eyeballs": "Клиент получает кандидатов IPv6 и IPv4, упорядочивает адреса и запускает попытки с небольшим смещением. Побеждает соединение, которое быстрее становится пригодным, а остальные попытки отменяются.",
  "Таблица маршрутов": "По адресу назначения ядро выполняет longest-prefix match в локальной таблице и выбирает interface, source address и next hop. Политики VPN, несколько интерфейсов и метрики маршрутов могут изменить результат.",
  "Proxy или VPN": "PAC-файл, системная настройка или enterprise policy может выбрать forward proxy, который сам установит соединение к origin; HTTPS обычно проходит через CONNECT tunnel. VPN добавляет внешний туннель и меняет видимые DNS, source IP, MTU и маршрут до места выхода.",
  "Кеш соседей": "Neighbor table связывает IP следующего узла с адресом канального уровня и состоянием достижимости. Актуальная запись позволяет сразу сформировать кадр, а устаревшая требует повторного подтверждения.",
  "ARP или NDP": "IPv4 отправляет широковещательный ARP who-has и получает MAC-адрес в ответе. IPv6 использует ICMPv6 Neighbor Solicitation/Advertisement, multicast и дополнительные проверки достижимости.",
  "Канальный кадр": "Сетевой пакет получает заголовок Ethernet или 802.11 с адресами следующего hop и контрольной суммой кадра. Коммутатор или точка доступа передаёт его внутри локального сегмента, не анализируя HTTP.",
  "NAT и firewall": "Stateful NAT создаёт отображение внутренней пары IP:port во внешнюю и хранит состояние потока. Firewall сопоставляет пакет с правилами и состоянием соединения, после чего разрешает, отклоняет или молча отбрасывает его.",
  "IP-заголовок": "IPv4 или IPv6 заголовок несёт адреса отправителя и получателя, идентификатор следующего протокола и hop limit. DSCP/ECN могут передавать требования к обслуживанию и явный сигнал перегрузки.",
  "MTU и PMTUD": "Path MTU ограничивает самый крупный пакет, который проходит без нежелательной фрагментации. Узел использует ICMP-сигналы или Packetization Layer PMTUD, а транспорт подбирает размер сегмента или QUIC datagram.",
  "Маршрутизаторы": "Каждый маршрутизатор ищет наиболее длинный подходящий префикс в FIB и меняет только канальную оболочку для следующего участка. Очереди, shaping и конкурирующий трафик создают задержку, jitter и потери.",
  "BGP и Anycast": "BGP распространяет достижимость IP-префиксов между автономными системами и выбирает маршрут по политике, а не только по географической близости. Один Anycast-адрес может анонсироваться из многих PoP, поэтому сеть приводит клиента к доступной площадке.",
  "TTL / Hop Limit": "Маршрутизатор уменьшает TTL IPv4 или Hop Limit IPv6 перед пересылкой. При нуле пакет удаляется и обычно формируется ICMP Time Exceeded — на этом механизме основан traceroute.",
  "Выбор транспорта": "Для h2 и http/1.1 обычно создаётся TCP-соединение, а h3 работает поверх QUIC/UDP. Подсказку HTTP/3 клиент получает из HTTPS DNS record, Alt-Svc или ранее сохранённого состояния, после чего проверяет фактическую доступность пути.",
  "Надёжность TCP": "TCP нумерует байты, подтверждает диапазоны данных и повторяет сегменты по таймеру или дублирующим ACK. Скользящее receive window обеспечивает flow control, чтобы быстрый отправитель не переполнил буфер получателя.",
  "Контроль перегрузки": "Congestion window ограничивает объём неподтверждённых данных независимо от окна получателя. Алгоритм оценивает RTT, потери или ECN и меняет скорость через slow start, congestion avoidance и recovery.",
  "QUIC / HTTP/3": "QUIC переносит надёжные потоки в зашифрованных UDP datagram и встраивает TLS 1.3 в handshake. Потеря пакета задерживает только затронутые потоки, а Connection ID позволяет пережить смену IP, например переход Wi-Fi → LTE.",
  "Повторное соединение": "HTTP/2 и HTTP/3 мультиплексируют много запросов в одном соединении, а браузер поддерживает connection pool по origin. TLS PSK resumption и QUIC 0-RTT уменьшают число обменов, но ранние данные допустимы только для операций, безопасных при повторе.",
  "SNI и ALPN": "SNI сообщает, сертификат какого имени нужен на общем IP-адресе, а ALPN выбирает прикладной протокол без дополнительного round trip. Encrypted ClientHello может дополнительно скрыть внутреннее ClientHello, включая реальное имя, от наблюдателя сети.",
  "Server Hello": "Сервер фиксирует TLS 1.3 cipher suite и отвечает key_share для (EC)DHE. После вычисления handshake secret большая часть последующих сообщений рукопожатия уже защищена ключами handshake traffic.",
  "Finished": "Finished содержит MAC от transcript hash всех согласованных сообщений и доказывает владение производными ключами. После взаимной проверки стороны выводят application traffic secrets и начинают передавать HTTP.",
  "Возобновление TLS": "Сервер выдаёт NewSessionTicket, из которого клиент сохраняет PSK и параметры сессии. При следующем соединении PSK сокращает handshake; 0-RTT может отправить ранние данные до подтверждения сервера и поэтому имеет риск replay.",
  "Версия HTTP": "HTTP/1.1 кодирует start-line и поля текстом и обычно обрабатывает ограниченное число параллельных соединений. HTTP/2 использует HEADERS/DATA frames и HPACK, HTTP/3 — QUIC streams и QPACK при одинаковой HTTP-семантике.",
  "Cookie и авторизация": "Браузер выбирает cookie по Domain, Path, Secure, SameSite и сроку действия; HttpOnly запрещает доступ из JavaScript, но не отправку. Authorization, Origin, Fetch Metadata и anti-CSRF token помогают серверу установить личность и контекст запроса.",
  "Тело запроса": "Тело может быть JSON, URL-encoded формой, multipart, бинарным объектом или потоком. Content-Type описывает представление, Content-Length или framing задаёт границы, а CORS может потребовать предварительный OPTIONS preflight.",
  "Точка присутствия": "DNS или Anycast приводит соединение к edge-площадке с сетевой близостью и достаточной доступностью. PoP завершает клиентский транспорт и при необходимости прокладывает оптимизированный магистральный путь до origin.",
  "Защита DDoS": "Edge агрегирует телеметрию L3–L7, применяет rate limiting, challenge, connection limits и фильтрацию известных аномалий. Цель — поглотить объём атаки до того, как ограниченный origin исчерпает каналы или вычислительные ресурсы.",
  "WAF": "WAF нормализует запрос и проверяет путь, поля, тело и поведение по managed и пользовательским правилам. Он может блокировать инъекции и обходы, но не заменяет валидацию и авторизацию внутри приложения.",
  "TLS termination": "Пограничный proxy расшифровывает клиентский TLS, получает HTTP и применяет L7-политику. До origin обычно создаётся отдельное TLS-соединение с собственной проверкой имени, ключами и иногда mTLS.",
  "Балансировщик": "Load balancer исключает нездоровые инстансы по health checks и выбирает backend алгоритмом вроде round-robin, least-connections или consistent hashing. Session affinity может удерживать пользователя на одном узле, хотя stateless-архитектура обычно устойчивее.",
  "Edge-кеш": "Ключ кеша строится из URL, метода и выбранных полей Vary; Cache-Control определяет свежесть и возможность shared caching. HIT возвращает объект немедленно, MISS или stale запускает обращение к origin и последующее заполнение кеша.",
  "Виртуальный хост": "Reverse proxy или HTTP daemon сопоставляет authority/Host и порт с конфигурацией сайта. Он проверяет ограничения метода и размера, нормализует framing и добавляет доверенные сведения о прокси-пути.",
  "Rewrite и роутинг": "Правила переписывания могут канонизировать URL, перенаправить клиента или внутренне изменить путь. Router приложения затем сопоставляет метод, шаблон пути и параметры с конкретным handler.",
  "Middleware": "Цепочка middleware создаёт trace ID, пишет access log, применяет CORS, rate limit, аутентификацию и авторизацию. Порядок важен: ошибочная последовательность может раскрыть данные или выполнить дорогую работу до отказа.",
  "Бизнес-логика": "Доменный слой проверяет инварианты, права и текущее состояние перед изменением данных. Он организует транзакции и побочные эффекты, стараясь сохранить идемпотентность там, где запрос может повториться.",
  "Кеш приложения": "In-process cache минимизирует задержку, а распределённый кеш вроде Redis разделяется между инстансами. TTL, invalidation, stampede protection и согласованность определяют, насколько безопасно использовать найденное значение.",
  "База данных": "Драйвер получает соединение из pool, передаёт параметризованный запрос, а СУБД строит или переиспользует план. Индексы, блокировки, MVCC, buffer cache, дисковый I/O и репликация влияют на время и результат.",
  "Внешние сервисы": "Исходящие вызовы имеют собственные DNS, соединение, TLS, лимиты и очереди ожидания. Timeout, retry с backoff, circuit breaker и idempotency key ограничивают каскадные отказы и дублирование операций.",
  "SSR или шаблон": "Сервер сериализует результат в согласованный Content-Type: HTML, JSON, RSC stream или файл. Потоковый SSR может отправить оболочку раньше готовности всех данных, а escaping защищает контекст HTML от инъекций.",
  "Сжатие": "Сервер выбирает кодирование по Accept-Encoding и типу содержимого; уже сжатые изображения обычно не выигрывают. Brotli, gzip или Zstandard уменьшают сеть ценой CPU и требуют Vary: Accept-Encoding для корректного кеша.",
  "Фрейминг ответа": "HTTP/1.1 использует Content-Length, chunked transfer encoding или закрытие соединения, а HTTP/2/3 — DATA frames в потоке. Framing отделяет одно сообщение от другого и позволяет начать обработку до полного тела.",
  "Preload scanner": "Пока основной HTML parser может быть остановлен синхронным script, отдельный сканер ищет очевидные URL ресурсов впереди. preload/modulepreload и fetchpriority дают дополнительные подсказки, но окончательное расписание остаётся за браузером.",
  "Выполнение скриптов": "Parser-blocking script останавливает построение DOM до загрузки и выполнения; defer и module ждут завершения парсинга, а async запускается по готовности. Каждое выполнение может изменить DOM, создать запросы и инвалидировать последующие стадии рендера.",
  "Веб-шрифты": "Алгоритм font matching выбирает face по семье, весу, стилю и диапазону Unicode, после чего ресурс проходит CORS и sanitizer. font-display определяет, будет ли текст временно невидимым, запасным или заменится после загрузки.",
  "Другие origin": "У нового origin собственная граница соединений, cookie и разрешений, поэтому могут повториться DNS, transport и TLS. Same-origin policy ограничивает чтение ответа, а CORS предоставляет серверу способ явно разрешить межсайтовый доступ.",
  "Recalculate Style": "Style engine сопоставляет селекторы с DOM, применяет origin каскада, layers, specificity, inheritance и custom properties. Изменение класса или состояния может инвалидировать только затронутую часть дерева, но сложные зависимости расширяют перерасчёт.",
  "Event loop": "Одна task выполняется до конца, затем очищается очередь microtasks, после чего браузер получает возможность обновить рендеринг. requestAnimationFrame вызывается перед кадром, а длинная задача блокирует ввод, скрипты и визуальное обновление главного потока.",
  "Нажатие Enter": "Матрица клавиатуры фиксирует замыкание переключателя, а сенсорный контроллер — координаты касания. Контроллер подавляет дребезг, определяет изменение состояния и помечает его временем.",
  "USB или Bluetooth": "USB HID обычно доставляет input report через периодически опрашиваемый interrupt endpoint. Bluetooth HID передаёт аналогичный отчёт через HOGP/GATT или L2CAP к host controller.",
  "Драйвер и прерывание": "Host controller сигнализирует о данных через IRQ/MSI или очередь событий, после чего драйвер читает HID report. Ядро отделяет транспорт устройства от общей модели клавиш и модификаторов.",
  "Очередь событий ОС": "ОС сопоставляет HID usage со scan code, раскладкой и состоянием модификаторов. Затем она создаёт keydown и помещает его в платформенную очередь событий.",
  "Активное окно": "Window server или compositor хранит keyboard focus и выбирает процесс-получатель. Событие проходит через IPC к UI-потоку браузера и активному omnibox.",
  "Очередь сетевого адаптера": "Драйвер записывает дескрипторы буферов в TX ring, а NIC читает данные через DMA. Offload может перенести на адаптер вычисление checksum, сегментацию и распределение очередей.",
  "Физический сигнал": "PHY применяет line coding, модуляцию и синхронизацию, превращая биты в сигнал среды. Ethernet, оптика и Wi‑Fi используют разные схемы коррекции ошибок и восстановления такта.",
  "Switch или Wi-Fi AP": "Ethernet switch обучается MAC-адресам и пересылает кадр на выбранный порт. Wi‑Fi AP дополнительно управляет доступом к общей среде, шифрованием, подтверждениями и повторными передачами.",
  "Модем или ONT": "Устройство инкапсулирует локальный Ethernet в DOCSIS, PON, DSL или мобильный bearer. Оно синхронизируется с оборудованием провайдера и получает интервалы для upstream-передачи.",
  "Последняя миля": "Доступный участок часто разделяется с соседями и добавляет очереди перед сетью агрегации. Помехи, уровень сигнала и расписание канала влияют на latency, jitter и потери.",
  "Приём на NIC": "PHY восстанавливает сигнал, а MAC проверяет длину, адрес и FCS кадра. RSS может по хешу потока выбрать RX queue и процессор для дальнейшей обработки.",
  "DMA и interrupt": "NIC через DMA записывает пакетные буферы в RAM и обновляет receive descriptors. MSI-X, interrupt coalescing и NAPI-подобный polling уменьшают стоимость потока прерываний.",
  "Сетевой стек ядра": "Ядро последовательно снимает L2, IP и TCP/UDP-оболочки, проверяет checksum и собирает фрагменты. Пятёрка protocol/source/destination адресов и портов связывает пакет с transport flow.",
  "Conntrack и фильтры": "State table определяет, относится ли пакет к новому или существующему соединению. Netfilter, nftables, eBPF или cloud policy могут выполнить NAT, разрешить либо отбросить пакет.",
  "Socket buffer": "TCP собирает упорядоченный byte stream, а UDP сохраняет границы datagram перед постановкой данных в receive queue. Ограниченный буфер создаёт backpressure и влияет на advertised receive window.",
  "Accept queue": "TCP различает очередь незавершённых handshakes и очередь полностью установленных соединений. Backlog, SYN cookies и лимиты определяют поведение сервера при всплеске подключений.",
  "Event notification": "epoll и kqueue сообщают readiness, тогда как IOCP обычно сообщает completion операции. Runtime снимает событие и связывает его с connection object или coroutine.",
  "Планировщик ОС": "Готовый worker конкурирует за CPU с другими runnable threads и процессами. Приоритеты, cgroups, quotas и NUMA locality могут заметно изменить серверную задержку.",
  "Декодирование байтов": "Encoding выбирается по BOM, Content-Type и правилам HTML sniffing, после чего потоковый decoder создаёт Unicode code points. Он сохраняет неполные многобайтовые последовательности между сетевыми chunks.",
  "Парсинг JavaScript": "Lexer и parser строят токены, scopes и внутреннее синтаксическое дерево, одновременно выявляя early errors. ES modules дополнительно создают граф импортов, связываются и только затем вычисляются.",
  "Bytecode и JIT": "Движок быстро запускает код через interpreter или baseline compiler и собирает профиль типов. Горячие функции оптимизируются в machine code, а нарушение предположений вызывает deoptimization.",
  "Web APIs": "DOM, fetch, timers и storage реализованы хостом браузера, а не самим языком JavaScript. Асинхронная работа возвращает результат через task, promise job или событие после проверок origin и permissions.",
  "Garbage collection": "Tracing collector начинает с roots и отмечает достижимые объекты, часто разделяя heap на поколения. Incremental и concurrent фазы уменьшают паузы, но allocation pressure всё равно может задержать main thread.",
  "Workers": "Worker имеет отдельный agent, heap и event loop и не получает прямой доступ к DOM. Данные передаются structured clone, Transferable objects или общей памятью при выполнении требований изоляции.",
  "Дерево доступности": "Нативная семантика HTML и ARIA преобразуются в роли, имена, состояния и отношения. Браузер инкрементально публикует дерево через accessibility API ОС для screen reader и других assistive tools.",
  "Формирование текста": "Unicode bidi, script segmentation и font fallback выбирают направление, язык и шрифт. Shaping engine применяет ligatures и kerning и выдаёт glyph runs с точными позициями.",
  "DOMContentLoaded": "Событие ставится после окончания HTML parser и выполнения defer и module scripts. Оно не ждёт async scripts, изображения и большинство фоновых ресурсов.",
  "Событие load": "Window load возникает после завершения документа и его обязательных зависимых ресурсов. Lazy-loaded содержимое и запросы, запущенные позже кодом, могут продолжаться после него.",
  "Lazy и фоновые ресурсы": "Viewport и scheduler запускают lazy images, prefetch, analytics и обновление Service Worker с подходящим приоритетом. Такая работа делит сеть, CPU и память с интерактивными задачами страницы.",
  "Обработка ввода": "Compositor выполняет hit testing, затем DOM dispatch проходит capture, target и bubble. Handler обновляет состояние, после чего style/layout/paint/composite создают кадр; эту задержку отражает INP.",
  "Keep-Alive": "Пул соединений повторно использует TCP и мультиплексирует запросы через HTTP/2 или HTTP/3. Idle timeout клиента, proxy или сервера определяет, как долго состояние остаётся открытым.",
  "Закрытие соединения": "TCP завершает направления FIN/ACK и может сохранять endpoint в TIME_WAIT. QUIC использует CONNECTION_CLOSE, stateless reset или idle timeout и отдельно удаляет криптографическое состояние.",
  "Обновление кешей": "Cache-Control, TTL и validators определяют запись в memory cache, disk cache и Cache Storage. Ограничения размера вызывают eviction, а stale-объект позже требует revalidation.",
  "Метрики и телеметрия": "Navigation, Resource и Event Timing описывают клиентские фазы, а Server-Timing добавляет данные backend. traceparent связывает spans между edge и сервисами, тогда как logs и RUM помогают найти отклонения.",
};

const englishTechnicalDetails: Record<string, string> = {
  "Enter the URL": "Navigation creates a new request in the context of the current tab. The browser also decides whether the input is a URL, a search query, or an internal scheme.",
  "HID signal": "A physical keyboard controller produces a HID report with a scan code, while an on-screen keyboard creates an equivalent software event from touch coordinates. The driver and OS kernel translate low-level input into a platform key event independent of a particular device model.",
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
  "Open a socket": "HTTP/1.1 and HTTP/2 use a TCP SOCK_STREAM, while QUIC uses a UDP SOCK_DGRAM; either can use IPv4 or IPv6. The kernel selects an ephemeral source port and associates the endpoint with its destination address and port.",
  "ARP and gateway": "Before sending an Ethernet or Wi-Fi frame, the host needs the link-layer address of its next hop. IPv4 finds it through the cache and a broadcast ARP query; IPv6 uses Neighbor Discovery for the same purpose.",
  "Routing": "The kernel adds an IP header and the link layer adds interface addresses. Each router reads the destination, decreases the Hop Limit or TTL, and forwards the packet according to its routing table.",
  "SYN": "The TCP segment carries the SYN flag, an initial sequence number, and options such as MSS and window scaling. These values begin negotiation of a reliable byte stream.",
  "SYN-ACK": "The server returns its own sequence number and acknowledges the client's number. Its network stack also allocates state for the pending connection.",
  "ACK": "The final ACK confirms the server's sequence number. Both endpoints enter the ESTABLISHED state and may now exchange application data.",
  "Client Hello": "The message includes SNI, ALPN, cipher suites, and a TLS 1.3 key share. ALPN can select HTTP/2 or HTTP/1.1 during the same handshake.",
  "Certificate": "The server sends an X.509 certificate chain and a signature over the handshake parameters. Its public key links the domain name to possession of the corresponding private key.",
  "Verification": "The browser builds a chain to a trusted root and checks signatures, validity dates, and the domain SAN. Any failed check prevents a trusted secure connection.",
  "Certificate status": "The server can staple an OCSP response so the client does not need a separate CA request; CRLs and browser-specific mechanisms supplement revocation checks. Signed Certificate Timestamps prove logging in Certificate Transparency, though failure policy varies by client.",
  "Session key": "Both peers independently derive the same shared secret from the key exchange. Symmetric traffic keys are then derived and used by an AEAD cipher to protect confidentiality and integrity.",
  "Method and path": "HTTP/1.1 uses a request line, while HTTP/2 and HTTP/3 carry the same semantics in :method, :scheme, :authority, and :path pseudo-fields. GET usually has no body, so the path and query identify the resource.",
  "Headers": "Host selects the virtual server, Accept describes supported representations, and Cookie carries session state. Headers also control caching and content negotiation.",
  "Send": "HTTP/1.1 and HTTP/2 pass through TLS records, TCP segments, and IP packets; HTTP/3 encodes frames in QUIC streams carried by UDP datagrams. TCP or QUIC provides reliability, flow control, and retransmission.",
  "Process": "A reverse proxy or web server maps the host and path to an application route. The handler may query caches, databases, or external services before producing a result.",
  "Validate cache": "The browser may send If-None-Match with an ETag or If-Modified-Since with the stored copy's date. An unchanged resource produces a bodyless 304 response; otherwise the server sends fresh content with 200.",
  "Status and headers": "The status code identifies the result class, while Content-Type defines how to interpret the body. Cache-Control, ETag, and Set-Cookie manage caching and client state.",
  "Response body": "The body may use Content-Length, HTTP/1.1 chunked encoding, or DATA frames in an HTTP/2 or HTTP/3 stream. The browser decodes Content-Encoding such as gzip, Brotli, or Zstandard before parsing.",
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
  "Interpret input": "The omnibox applies heuristics to the string and its context, including the scheme, spaces, history, and search policy. The result becomes a navigation URL, a search URL, or an internal browser command.",
  "Service Worker": "For a controlled origin, a fetch event reaches the Service Worker, which can return a Response from Cache Storage, synthesize one, or continue to the network. This is separate from the HTTP cache and applies only within the registration scope.",
  "Select resolver": "A classic stub resolver normally uses a DHCP- or RA-provided server over UDP/TCP port 53. The browser or OS may instead use DoT on 853 or map DNS exchanges to HTTPS on 443 with DoH.",
  "DNS query": "The message contains a header with an ID and flags, a Question section with QNAME/QTYPE/QCLASS, and often EDNS(0). Modern clients may request A, AAAA, and HTTPS/SVCB data that advertises ALPN, alternate ports, and address hints.",
  "DNSSEC": "A validating resolver checks an RRSIG with the zone's DNSKEY and connects that key to its parent through DS records. DNSSEC authenticates origin and integrity; it does not encrypt DNS traffic.",
  "Happy Eyeballs": "The client orders IPv6 and IPv4 candidates and starts connection attempts with a small offset. The first usable connection wins and the remaining attempts are cancelled.",
  "Routing table": "The kernel performs a longest-prefix match to select an interface, source address, and next hop. VPN policy, multiple interfaces, and route metrics can change the result.",
  "Proxy or VPN": "A PAC file, system setting, or enterprise policy can select a forward proxy that connects to origin; HTTPS normally crosses it with a CONNECT tunnel. A VPN adds an outer tunnel and changes visible DNS, source IP, MTU, and the path to its exit point.",
  "Neighbor cache": "The neighbor table maps the next-hop IP to a link-layer address and reachability state. A fresh entry allows immediate framing; a stale one needs confirmation.",
  "ARP or NDP": "IPv4 broadcasts an ARP who-has request and learns a MAC address from the reply. IPv6 uses ICMPv6 Neighbor Solicitation and Advertisement with multicast and reachability checks.",
  "Link-layer frame": "The network packet receives an Ethernet or 802.11 header containing next-hop link addresses and a frame check sequence. A switch or access point carries it inside the local segment without interpreting HTTP.",
  "NAT and firewall": "Stateful NAT maps an internal IP:port pair to an external one and records flow state. A firewall evaluates rules and connection state before allowing, rejecting, or silently dropping traffic.",
  "IP header": "An IPv4 or IPv6 header carries source and destination addresses, the next-protocol identifier, and a hop limit. DSCP and ECN can express forwarding treatment and explicit congestion feedback.",
  "MTU and PMTUD": "Path MTU limits the largest packet that crosses the route without unwanted fragmentation. The endpoint uses ICMP feedback or Packetization Layer PMTUD, while the transport adjusts segment or QUIC datagram size.",
  "Routers": "Each router performs a longest-prefix lookup in its forwarding table and replaces only the link-layer envelope for the next segment. Queues, shaping, and competing traffic create delay, jitter, and loss.",
  "BGP and Anycast": "BGP distributes IP-prefix reachability between autonomous systems and selects routes according to policy, not only geography. One Anycast address can be announced from many PoPs, so the network delivers the client to an available site.",
  "TTL / Hop Limit": "A router decrements IPv4 TTL or IPv6 Hop Limit before forwarding. At zero it discards the packet and usually returns ICMP Time Exceeded, which is also the basis of traceroute.",
  "Choose transport": "h2 and http/1.1 normally use TCP, while h3 runs over QUIC/UDP. The client can learn HTTP/3 support from an HTTPS DNS record, Alt-Svc, or saved state, then verifies that the path actually works.",
  "TCP reliability": "TCP numbers bytes, acknowledges ranges, and retransmits based on timers or duplicate acknowledgements. Its sliding receive window provides flow control so a fast sender does not overflow the receiver.",
  "Congestion control": "The congestion window limits unacknowledged data independently of the receiver window. An algorithm estimates RTT, loss, or ECN and adjusts sending through slow start, congestion avoidance, and recovery.",
  "QUIC / HTTP/3": "QUIC carries reliable streams in encrypted UDP datagrams and integrates TLS 1.3 into its handshake. Packet loss stalls only affected streams, while Connection IDs can survive an IP change such as Wi-Fi to cellular.",
  "Connection reuse": "HTTP/2 and HTTP/3 multiplex many requests on one connection, and browsers maintain origin connection pools. TLS PSK resumption and QUIC 0-RTT reduce exchanges, but early data is suitable only for replay-safe operations.",
  "SNI and ALPN": "SNI identifies the certificate name required on a shared IP, while ALPN selects the application protocol without another round trip. Encrypted ClientHello can additionally hide the inner ClientHello, including the real name, from on-path observers.",
  "Server Hello": "The server fixes the TLS 1.3 cipher suite and returns its (EC)DHE key share. Once both sides derive the handshake secret, most later handshake messages are already protected by handshake traffic keys.",
  "Finished": "Finished carries a MAC over the transcript hash and proves possession of the derived keys. After mutual verification, both peers derive application traffic secrets and begin carrying HTTP.",
  "TLS resumption": "NewSessionTicket gives the client a PSK and saved session parameters. A later PSK handshake is shorter; 0-RTT can send early data before server confirmation and therefore has replay risk.",
  "HTTP version": "HTTP/1.1 uses a textual start line and fields with limited connection parallelism. HTTP/2 uses HEADERS/DATA frames and HPACK, while HTTP/3 uses QUIC streams and QPACK with the same HTTP semantics.",
  "Cookies and auth": "The browser selects cookies by Domain, Path, Secure, SameSite, and expiry; HttpOnly prevents JavaScript access but not transmission. Authorization, Origin, Fetch Metadata, and anti-CSRF tokens help establish identity and request context.",
  "Request body": "The body can be JSON, a URL-encoded form, multipart data, binary content, or a stream. Content-Type names the representation, framing provides boundaries, and CORS may require an OPTIONS preflight.",
  "Point of presence": "DNS or Anycast delivers the connection to an edge site with suitable network proximity and availability. The PoP terminates client transport and may use an optimized backbone path to origin.",
  "DDoS protection": "The edge aggregates L3–L7 telemetry and applies rate limits, challenges, connection limits, and anomaly filters. It absorbs attack volume before the smaller origin exhausts bandwidth or compute.",
  "WAF": "A WAF normalizes the request and inspects the path, fields, body, and behavior with managed and custom rules. It can block common injections and evasions but does not replace validation and authorization inside the application.",
  "TLS termination": "The edge proxy decrypts client TLS, obtains HTTP, and applies Layer 7 policy. It normally creates a separate TLS connection to origin with its own name verification, keys, and sometimes mTLS.",
  "Load balancer": "Health checks remove unhealthy instances, then the balancer chooses a backend using round-robin, least-connections, consistent hashing, or a similar policy. Session affinity can pin users, though stateless services are generally more resilient.",
  "Edge cache": "The cache key combines the URL, method, and selected Vary fields; Cache-Control governs freshness and shared reuse. A HIT returns immediately, while MISS or stale data triggers origin retrieval and cache fill.",
  "Virtual host": "A reverse proxy or HTTP daemon maps authority/Host and port to the site configuration. It checks method and size limits, normalizes framing, and attaches trusted proxy-path metadata.",
  "Rewrite and routing": "Rewrite rules can canonicalize a URL, redirect the client, or internally change the path. The application router then matches the method, path template, and parameters to a handler.",
  "Middleware": "A middleware chain creates trace IDs, writes access logs, and applies CORS, rate limits, authentication, and authorization. Ordering matters because a bad sequence can expose data or perform expensive work before rejection.",
  "Business logic": "The domain layer checks invariants, permissions, and current state before changing data. It coordinates transactions and side effects while preserving idempotency where requests may be retried.",
  "Application cache": "An in-process cache minimizes latency, while a distributed cache such as Redis is shared by instances. TTL, invalidation, stampede protection, and consistency determine whether a hit is safe to use.",
  "Database": "A driver checks out a pooled connection and sends a parameterized query; the database builds or reuses a plan. Indexes, locks, MVCC, buffer cache, disk I/O, and replication all affect latency and results.",
  "External services": "Outbound dependencies have their own DNS, connections, TLS, limits, and queues. Timeouts, backoff retries, circuit breakers, and idempotency keys constrain cascading failure and duplicate operations.",
  "SSR or template": "The server serializes results into the negotiated Content-Type: HTML, JSON, an RSC stream, or a file. Streaming SSR can send a shell before all data is ready, while contextual escaping prevents HTML injection.",
  "Compression": "The server chooses an encoding from Accept-Encoding and content type; already compressed images rarely benefit. Brotli, gzip, or Zstandard trade CPU for fewer bytes and require Vary: Accept-Encoding in shared caches.",
  "Response framing": "HTTP/1.1 uses Content-Length, chunked transfer encoding, or connection close, while HTTP/2 and HTTP/3 use DATA frames in a stream. Framing separates messages and enables processing before the full body arrives.",
  "Preload scanner": "While a synchronous script may block the main HTML parser, a speculative scanner looks ahead for obvious resource URLs. preload, modulepreload, and fetchpriority add hints, but the browser retains scheduling control.",
  "Execute scripts": "A parser-blocking script pauses DOM construction; defer and module wait for parsing, while async runs when ready. Execution can mutate the DOM, issue requests, and invalidate later rendering stages.",
  "Web fonts": "Font matching selects a face by family, weight, style, and Unicode range, then the resource passes CORS and sanitization. font-display controls whether text is hidden, uses a fallback, or swaps after download.",
  "Other origins": "A new origin has separate connection, cookie, and permission boundaries, so DNS, transport, and TLS may repeat. Same-origin policy prevents reading responses, while CORS lets the server explicitly grant cross-origin access.",
  "Recalculate Style": "The style engine matches selectors and applies cascade origin, layers, specificity, inheritance, and custom properties. A class or state change can invalidate only part of the tree, but complex dependencies widen recalculation.",
  "Event loop": "One task runs to completion, then microtasks are drained before the browser gets an opportunity to update rendering. requestAnimationFrame runs before a frame, while a long task blocks input, scripts, and visual updates on the main thread.",
  "Press Enter": "A keyboard matrix detects a closed switch, while a touch controller detects contact coordinates. The controller debounces the change, timestamps it, and prepares an input report.",
  "USB or Bluetooth": "USB HID normally carries an input report through a polled interrupt endpoint. Bluetooth HID delivers an equivalent report through HOGP/GATT or L2CAP to the host controller.",
  "Driver and interrupt": "The host controller signals data through IRQ/MSI or an event queue, then the driver decodes the HID report. The kernel hides device transport details behind a common key and modifier model.",
  "OS event queue": "The OS maps a HID usage through scan codes, keyboard layout, and modifier state. It creates a keydown event and places it in the platform event queue.",
  "Focused window": "The window server or compositor owns keyboard focus and selects the destination process. IPC delivers the event to the browser UI thread and its focused omnibox control.",
  "Network adapter queue": "The driver writes buffer descriptors into a TX ring and the NIC reads payload through DMA. Checksum, segmentation, and queue-selection offloads may move work from the CPU to the adapter.",
  "Physical signal": "The PHY applies line coding, modulation, and synchronization to turn bits into a medium-specific signal. Ethernet, fiber, and Wi‑Fi use different error correction and clock recovery schemes.",
  "Switch or Wi-Fi AP": "An Ethernet switch learns MAC addresses and forwards the frame through a selected port. A Wi‑Fi AP additionally manages shared-medium contention, encryption, acknowledgements, and retransmission.",
  "Modem or ONT": "The device encapsulates local Ethernet into DOCSIS, PON, DSL, or a cellular bearer. It synchronizes with provider equipment and receives upstream transmission opportunities.",
  "Last mile": "The access segment is often shared with nearby subscribers and adds queues before aggregation. Noise, signal quality, and channel scheduling influence latency, jitter, and loss.",
  "NIC receive": "The PHY recovers the signal and the MAC validates frame length, address, and FCS. Receive-side scaling can hash the flow onto a specific RX queue and CPU.",
  "DMA and interrupt": "The NIC writes packet buffers into RAM through DMA and updates receive descriptors. MSI-X, interrupt coalescing, and NAPI-style polling reduce interrupt overhead under load.",
  "Kernel network stack": "The kernel removes link, IP, and TCP or UDP headers, validates checksums, and reassembles fragments. The protocol plus source and destination addresses and ports identify the transport flow.",
  "Conntrack and filters": "A state table determines whether the packet belongs to a new or established connection. Netfilter, nftables, eBPF, or cloud policy may perform NAT, allow it, or drop it.",
  "Socket buffer": "TCP reassembles an ordered byte stream, while UDP preserves datagram boundaries before queueing data. A bounded buffer creates backpressure and affects the advertised receive window.",
  "Accept queue": "TCP separates incomplete handshakes from the queue of fully established connections. Backlog limits and SYN cookies influence behavior during a connection surge.",
  "Event notification": "epoll and kqueue report readiness, whereas IOCP usually reports operation completion. The runtime maps each event back to a connection object or coroutine.",
  "OS scheduler": "A runnable worker competes with other threads and processes for CPU time. Priorities, cgroups, quotas, and NUMA locality can materially change server latency.",
  "Decode bytes": "A BOM, Content-Type, and HTML sniffing rules select the encoding before a streaming decoder emits Unicode code points. Incomplete multibyte sequences are retained across network chunks.",
  "Parse JavaScript": "A lexer and parser build tokens, scopes, and an internal syntax tree while reporting early errors. ES modules also form an import graph that is linked before evaluation.",
  "Bytecode and JIT": "The engine starts code quickly through an interpreter or baseline compiler and gathers type feedback. Hot functions become optimized machine code, while invalid assumptions trigger deoptimization.",
  "Web APIs": "The browser host, not JavaScript itself, implements the DOM, fetch, timers, and storage. Asynchronous results return through tasks, promise jobs, or events after origin and permission checks.",
  "Garbage collection": "A tracing collector starts from roots and marks reachable objects, often using generations. Incremental and concurrent phases reduce pauses, though allocation pressure can still delay the main thread.",
  "Workers": "A worker has a separate agent, heap, and event loop and cannot directly access the DOM. Data crosses through structured clone, transferable objects, or shared memory under isolation requirements.",
  "Accessibility tree": "Native HTML semantics and ARIA become roles, names, states, and relationships. The browser incrementally publishes this tree through platform accessibility APIs for screen readers and other assistive tools.",
  "Text shaping": "Unicode bidirectional processing, script segmentation, and font fallback select direction, language, and typeface. A shaping engine applies ligatures and kerning and emits precisely positioned glyph runs.",
  "DOMContentLoaded": "The event is queued after the HTML parser and deferred or module scripts complete. It does not wait for async scripts, images, or most background resources.",
  "load event": "Window load fires after the document and its required dependent resources finish. Lazy-loaded content and requests started later by code may continue afterward.",
  "Lazy and background resources": "Viewport signals and the scheduler start lazy images, prefetches, analytics, and Service Worker updates at appropriate priority. This work still shares network, CPU, and memory with interactive page tasks.",
  "Process input": "The compositor performs hit testing, then DOM dispatch runs capture, target, and bubble phases. A handler updates state and style/layout/paint/composite produce a frame; INP reflects this latency.",
  "Keep-Alive": "A connection pool reuses TCP and multiplexes requests through HTTP/2 or HTTP/3. Client, proxy, or server idle timeouts decide how long state stays open.",
  "Close connection": "TCP closes directions with FIN/ACK and may keep an endpoint in TIME_WAIT. QUIC uses CONNECTION_CLOSE, stateless reset, or idle timeout before discarding cryptographic state.",
  "Update caches": "Cache-Control, TTL, and validators govern writes to memory cache, disk cache, and Cache Storage. Size pressure causes eviction, while a stale object later requires revalidation.",
  "Metrics and telemetry": "Navigation, Resource, and Event Timing expose client phases, while Server-Timing adds backend data. traceparent joins spans across edge and services, and logs plus RUM reveal regressions.",
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
    introTechnical: "На каждом подшаге ниже появятся конкретные протоколы, структуры данных и сетевые обмены. Некоторые механизмы альтернативны друг другу или пропускаются благодаря кешу; время условное и служит только для сравнения.", conditionalTime: "Условное время",
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
    introTechnical: "Each substep names concrete protocols, data structures, and network exchanges. Some mechanisms are alternatives or are skipped on a cache hit; timing is illustrative and only supports comparison.", conditionalTime: "Illustrative time",
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
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetCenter = container.scrollLeft + targetRect.left - containerRect.left + targetRect.width / 2;
      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      const left = Math.min(maxScroll, Math.max(0, targetCenter - container.clientWidth / 2));
      const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      container.scrollTo({ left, behavior });
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
          h("div", [h("span", { class: "stage-index" }, activeStage.value ? String(activeStageIndex.value + 1).padStart(2, "0") : "00"), h("span", `/ ${String(stages.length).padStart(2, "0")}`)]),
          h("div", { class: "protocol-chip" }, [h("span", { class: secure.value ? "chip-dot secure" : "chip-dot" }), secure.value ? "HTTPS · 443" : "HTTP · 80"]),
        ]),

        h("div", { ref: flowRef, class: "flow", role: "list", "aria-label": text.loadingStages, style: { gridTemplateColumns: `repeat(${stages.length}, minmax(96px, 1fr))` } }, stages.map((stage, index) =>
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
                  ? technicalDetails[activeUnit.value.label] ?? activeUnit.value.detail
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
