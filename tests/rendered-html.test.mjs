import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the After Enter product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>What happens after you press Enter in the browser\?<\/title>/i);
  assert.match(html, /What happens after you press/);
  assert.match(html, /class="vue-mount"/);
  assert.doesNotMatch(html, /Sources on Habr|Источники на Хабре/);
  assert.doesNotMatch(html, /companies\/gnivc\/articles\/861432|companies\/htmlacademy\/articles\/254825/);
  assert.match(html, /https:\/\/t\.me\/devopsbrain/);
  assert.match(html, /Telegram · @devopsbrain/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("keeps the bilingual React and Vue simulator wired", async () => {
  const [page, shell, simulator, packageJson, russianJson, englishJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/localized-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/network-simulator.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/simulator-data/ru.json", import.meta.url), "utf8"),
    readFile(new URL("../app/simulator-data/en.json", import.meta.url), "utf8"),
  ]);
  const russianData = JSON.parse(russianJson);
  const englishData = JSON.parse(englishJson);

  assert.match(page, /What happens after you press Enter in the browser\?/);
  assert.match(shell, /<NetworkSimulator \/>/);
  assert.match(shell, /detectBrowserLocale/);
  assert.match(simulator, /createApp\(VueSimulator\)/);
  assert.match(simulator, /import englishData from "\.\/simulator-data\/en\.json"/);
  assert.match(simulator, /import russianData from "\.\/simulator-data\/ru\.json"/);
  assert.doesNotMatch(simulator, /QUIC \/ HTTP\/3|BGP и Anycast|Edge infrastructure|USB или Bluetooth/);
  assert.match(simulator, /getBoundingClientRect/);
  assert.match(simulator, /Math\.min\(maxScroll/);
  assert.doesNotMatch(simulator, /ПОШАГОВО|STEP BY STEP|sim-url|Website address|Адрес сайта/);
  assert.match(simulator, /stages\.length - 1/);
  assert.match(simulator, /class: "stage-navigation"/);
  assert.doesNotMatch(simulator, /role: "switch"|class: \["switch"|control-panel|cachedDnsSubsteps/);
  assert.match(simulator, /Вау, ты справился!/);
  assert.match(simulator, /Follow @devopsbrain/);
  assert.match(simulator, /class: "completion-cta"/);
  assert.match(simulator, /onTouchstart: startDescriptionSwipe/);
  assert.match(simulator, /Math\.abs\(deltaX\) < 48/);
  assert.match(simulator, /swipeHint/);
  assert.doesNotMatch(simulator, /setInterval|setTimeout\(nextStep/);
  assert.match(packageJson, /"react": "19\.2\.6"/);
  assert.match(packageJson, /"vue": "\^3\.5\.40"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  for (const data of [russianData, englishData]) {
    assert.equal(data.stages.length, 17);
    assert.equal(data.stages.flatMap((stage) => stage.substeps).length, 124);
    for (const substep of data.stages.flatMap((stage) => stage.substeps)) {
      assert.equal(typeof data.purposes[substep.label], "string");
      assert.equal(typeof data.technicalDetails[substep.label], "string");
    }
  }
  assert.match(russianJson, /BGP и Anycast/);
  assert.match(russianJson, /USB или Bluetooth/);
  assert.match(englishJson, /Edge infrastructure/);
  assert.match(englishJson, /Accessibility tree/);

  assert.deepEqual(await readdir(new URL("../app/_sites-preview", import.meta.url)), []);
});
