"use client";

import { useEffect, useRef } from "react";
import { computed, createApp, defineComponent, h, nextTick, ref, watch } from "vue";
import { detectBrowserLocale, type Locale } from "./i18n";
import englishData from "./simulator-data/en.json";
import russianData from "./simulator-data/ru.json";

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

const russianStages = russianData.stages as Stage[];
const englishStages = englishData.stages as Stage[];
const russianSubstepPurpose = russianData.purposes as Record<string, string>;
const englishSubstepPurpose = englishData.purposes as Record<string, string>;
const russianTechnicalDetails = russianData.technicalDetails as Record<string, string>;
const englishTechnicalDetails = englishData.technicalDetails as Record<string, string>;

const uiCopy: Record<Locale, Record<string, string>> = {
  ru: {
    simulatorLabel: "Симулятор загрузки веб-страницы",
    back: "← Назад",
    restart: "Сначала ↺", next: "Далее →", substepsOf: "из", substeps: "подшагов", loadingStages: "Этапы загрузки", goStage: "Перейти к этапу",
    stageSubsteps: "Подшаги этапа", goSubstep: "Перейти к подшагу", defaultPurpose: "Обеспечивает следующий этап",
    substepsPlaceholder: "Подшаги появятся после запуска", ready: "Финиш", browser: "Браузер", pageReady: "Вау, ты справился!",
    enterAddress: "Нажмите «Далее», чтобы начать путь", doneDetail: "Ты дошёл до последнего слайда и теперь действительно знаешь, что происходит после нажатия Enter в браузере.",
    doneTechnical: "За одним нажатием скрывается огромный путь: устройство и ОС, DNS и физическая сеть, транспорт и шифрование, серверное приложение, JavaScript и финальный кадр. Сохрани этот симулятор, чтобы быстро восстановить всю цепочку в памяти.",
    doneCta: "Подписаться на @devopsbrain →", doneSignal: "knowledge → unlocked",
    swipeHint: "Свайпните по описанию ← →",
    introDetail: "Вы увидите не только большие этапы, но и каждый внутренний подшаг.",
    introTechnical: "На каждом подшаге ниже появятся конкретные протоколы, структуры данных и сетевые обмены. Некоторые механизмы альтернативны друг другу или пропускаются благодаря кешу; время условное и служит только для сравнения.", conditionalTime: "Условное время",
    networkExchanges: "Сетевые обмены", currentNode: "Текущий узел", interactive: "Интерактив", milliseconds: "мс",
  },
  en: {
    simulatorLabel: "Web page loading simulator",
    back: "← Back",
    restart: "Start over ↺", next: "Next →", substepsOf: "of", substeps: "substeps", loadingStages: "Loading stages", goStage: "Go to stage",
    stageSubsteps: "Substeps for", goSubstep: "Go to substep", defaultPurpose: "Enables the next stage",
    substepsPlaceholder: "Substeps will appear after you start", ready: "Finish", browser: "Browser", pageReady: "Wow, you made it!",
    enterAddress: "Press Next to start the journey", doneDetail: "You reached the final slide and now truly know what happens after you press Enter in the browser.",
    doneTechnical: "A single key press hides an enormous journey through the device and OS, DNS and the physical network, transport and encryption, server applications, JavaScript, and the final frame. Save this simulator whenever you need to rebuild the whole chain in your head.",
    doneCta: "Follow @devopsbrain →", doneSignal: "knowledge → unlocked",
    swipeHint: "Swipe the description ← →",
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
    const substepPurpose = locale === "ru" ? russianSubstepPurpose : englishSubstepPurpose;
    const technicalDetails = locale === "ru" ? russianTechnicalDetails : englishTechnicalDetails;
    const current = ref(-1);
    const done = ref(false);
    const flowRef = ref<HTMLElement | null>(null);
    const substepTrackRef = ref<HTMLElement | null>(null);
    let swipeStart: { x: number; y: number } | null = null;

    const secure = ref(true);

    const stageSubsteps = (stage: Stage) => stage.substeps;
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

    function nextStep() {
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

    function startDescriptionSwipe(event: TouchEvent) {
      if (event.touches.length !== 1 || (event.target as Element).closest("a, button")) {
        swipeStart = null;
        return;
      }
      swipeStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }

    function finishDescriptionSwipe(event: TouchEvent) {
      if (!swipeStart || event.changedTouches.length !== 1) return;
      const deltaX = event.changedTouches[0].clientX - swipeStart.x;
      const deltaY = event.changedTouches[0].clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
      if (deltaX < 0) nextStep();
      else previousStep();
    }

    function jumpToRouteIndex(routeIndex: number) {
      if (routeIndex < 0) return;
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
      h("div", { class: "simulation-stage" }, [
        h("div", { class: "stage-topline" }, [
          h("div", { class: "stage-navigation" }, [
            h("div", { class: "stage-counter" }, [h("span", { class: "stage-index" }, activeStage.value ? String(activeStageIndex.value).padStart(2, "0") : "00"), h("span", `/ ${String(stages.length - 1).padStart(2, "0")}`)]),
            h("div", { class: "manual-controls" }, [
              h("button", { type: "button", class: "manual-button", disabled: current.value < 0, onClick: previousStep }, text.back),
              h("button", { type: "button", class: "manual-button is-primary", onClick: nextStep }, done.value ? text.restart : text.next),
            ]),
            h("p", { class: "estimate" }, `${Math.min(current.value + 1, route.value.length)} ${text.substepsOf} ${route.value.length} ${text.substeps}`),
          ]),
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
          h("div", {
            class: "event-content",
            onTouchstart: startDescriptionSwipe,
            onTouchend: finishDescriptionSwipe,
            onTouchcancel: () => { swipeStart = null; },
          }, [
            h("div", { class: "event-copy" }, [
              h("span", { class: "event-actor" }, done.value ? text.ready : activeStage.value?.title ?? text.browser),
              h("h2", done.value ? text.pageReady : activeUnit.value?.label ?? text.enterAddress),
              h("p", { class: "event-summary" }, done.value ? text.doneDetail : activeUnit.value?.detail ?? text.introDetail),
              h("p", { class: "event-technical" }, done.value
                ? text.doneTechnical
                : activeUnit.value
                  ? technicalDetails[activeUnit.value.label] ?? activeUnit.value.detail
                  : text.introTechnical),
              done.value ? h("a", {
                class: "completion-cta", href: "https://t.me/devopsbrain", target: "_blank", rel: "noreferrer",
              }, text.doneCta) : null,
            ]),
            h("code", { class: "signal-line" }, done.value ? text.doneSignal : activeUnit.value?.signal ?? "awaiting input…"),
            h("span", { class: "swipe-hint", "aria-hidden": "true" }, text.swipeHint),
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
