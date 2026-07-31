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
  assert.match(html, /<title>What happens after you press Enter\?<\/title>/i);
  assert.match(html, /What happens after you press/);
  assert.match(html, /class="vue-mount"/);
  assert.match(html, /Sources on Habr/);
  assert.match(html, /companies\/gnivc\/articles\/861432/);
  assert.match(html, /companies\/htmlacademy\/articles\/254825/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("keeps the bilingual React and Vue simulator wired", async () => {
  const [page, shell, simulator, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/localized-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/network-simulator.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /What happens after you press Enter\?/);
  assert.match(shell, /<NetworkSimulator \/>/);
  assert.match(shell, /detectBrowserLocale/);
  assert.match(simulator, /createApp\(VueSimulator\)/);
  assert.match(simulator, /const russianStages: Stage\[\]/);
  assert.match(simulator, /const englishStages: Stage\[\]/);
  assert.match(simulator, /QUIC \/ HTTP\/3/);
  assert.match(simulator, /BGP и Anycast/);
  assert.match(simulator, /Edge infrastructure/);
  assert.doesNotMatch(simulator, /setInterval|setTimeout\(nextStep/);
  assert.match(packageJson, /"react": "19\.2\.6"/);
  assert.match(packageJson, /"vue": "\^3\.5\.40"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  assert.deepEqual(await readdir(new URL("../app/_sites-preview", import.meta.url)), []);
});
