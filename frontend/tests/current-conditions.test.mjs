import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import ts from "typescript";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";

// Load the actual TSX components with the existing TypeScript compiler.
// CSS is irrelevant to DOM/state tests; no application or React hooks are mocked.
const require = createRequire(import.meta.url);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (specifier, ...args) {
  return originalResolve.call(this, specifier.startsWith("@/")
    ? fileURLToPath(new URL(`../src/${specifier.slice(2)}`, import.meta.url))
    : specifier, ...args);
};
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    });
    module._compile(outputText, filename);
  };
}
require.extensions[".css"] = (module) => {
  module.exports = new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) });
};
const CurrentConditions = require("../src/components/CurrentConditions.tsx").default;
const { fixture, requestedAt } = require("./current-conditions-fixture.ts");
const { translations } = require("../src/lib/i18n.ts");
Module._resolveFilename = originalResolve;

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
after(() => dom.window.close());
let root;
afterEach(async () => {
  if (root) await act(() => root.unmount());
  root = undefined;
  document.body.replaceChildren();
});


function props(locale = "en") {
  return { data: fixture(), nowMs: Date.parse(requestedAt), locale, timeZone: "Europe/Helsinki" };
}
async function render(input) {
  if (!root) {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  await act(() => root.render(React.createElement(CurrentConditions, input)));
}
const row = (key) => document.querySelector(`[data-condition="${key}"]`);
const value = (key) => row(key).querySelector("dd").firstChild.textContent;
const buttons = () => [...document.querySelectorAll("button")];

test("Simple defaults to seven ordered bilingual rows, aligned value cells and honest provenance", async () => {
  for (const locale of ["en", "fi"]) {
    await render(props(locale));
    const t = translations[locale].currentConditions;
    assert.deepEqual([...document.querySelectorAll("[data-condition]")].map(r => r.dataset.condition),
      ["temperature", "water", "wind", "gust", "cloud", "rain", "probability"]);
    assert.equal(buttons()[0].getAttribute("aria-pressed"), "true");
    assert.equal(buttons()[1].getAttribute("aria-pressed"), "false");
    assert.equal(buttons()[0].textContent, t.simple);
    assert.equal(buttons()[1].textContent, t.detailed);
    assert.equal(document.querySelector('[role="group"]').getAttribute("aria-label"), t.view);
    assert.equal(document.querySelectorAll("dt").length, 7);
    assert.equal(document.querySelectorAll("dd").length, 7);
    assert.equal(value("temperature"), locale === "fi" ? "8,4 °C" : "8.4 °C");
    assert.equal(value("water"), locale === "fi" ? "9,8 °C" : "9.8 °C");
    assert.equal(value("probability"), "20 %");
    assert.ok(row("rain").textContent.includes(`${t.rain} 18:00–19:00`));
    assert.ok(row("probability").textContent.includes(`${t.probability} 19:00–20:00`));
    assert.ok(row("probability").textContent.includes(t.forecast));
    assert.ok(row("probability").textContent.includes("Karhusaari"));
    assert.ok(row("temperature").textContent.includes("Helsinki Kaisaniemi"));
    assert.equal(row("water").querySelector("time").dateTime, "2026-10-19T18:32:00+03:00");
    assert.ok(row("water").querySelector("dd").title.includes("Lauttasaaren mattolaituri"));
    assert.equal(document.querySelectorAll("details").length, 0);
    buttons()[0].focus();
    assert.equal(document.activeElement, buttons()[0]);
  }
});

test("native buttons switch to an explicit placeholder, preserve selection across refresh, and restore Simple", async () => {
  const input = props();
  await render(input);
  const target = buttons()[1].getAttribute("aria-controls");
  await act(() => buttons()[1].click());
  assert.equal(buttons()[1].getAttribute("aria-pressed"), "true");
  assert.equal(document.getElementById(target).textContent, translations.en.currentConditions.detailedPlaceholder);
  assert.equal(document.querySelectorAll("table").length, 0);
  await render({ ...input, nowMs: input.nowMs + 60_000, data: fixture() });
  assert.equal(buttons()[1].getAttribute("aria-pressed"), "true");
  await act(() => buttons()[0].click());
  assert.equal(document.querySelectorAll("dd").length, 7);
});

test("null displays a dash, zero displays zero, cached stale readings and refresh failures are identified", async () => {
  const input = props();
  input.data.observations.data.observations[0].temperature = null;
  input.data.observations.data.observations[0].precipitation = 0;
  input.data.forecasts.data.forecasts[0].precipitation_probability = 0;
  await render(input);
  assert.equal(value("temperature"), "—");
  assert.ok(row("temperature").textContent.includes("Unavailable"));
  assert.equal(value("rain"), "0 mm");
  assert.equal(value("probability"), "0 %");
  await render({ ...input, nowMs: Date.parse("2026-10-19T21:30:00+03:00"), refreshFailed: true });
  assert.ok(row("water").textContent.includes("Updates delayed"));
  assert.ok(document.querySelector('[role="status"]').textContent.includes("original timestamps"));
  assert.equal(value("probability"), "—");
});

test("hour rolls forward from live time without borrowing a different forecast period", async () => {
  const input = props();
  await render(input);
  assert.equal(value("probability"), "20 %");
  await render({ ...input, nowMs: Date.parse("2026-10-19T20:00:00+03:00") });
  assert.equal(value("probability"), "40 %");
  assert.ok(row("probability").textContent.includes("20:00–21:00"));
});

test("server markup hydrates without mismatches and remains interactive", async () => {
  const input = props();
  const container = document.createElement("div");
  container.innerHTML = renderToString(React.createElement(CurrentConditions, input));
  document.body.append(container);
  const errors = [];
  await act(() => { root = hydrateRoot(container, React.createElement(CurrentConditions, input), { onRecoverableError: error => errors.push(error) }); });
  assert.deepEqual(errors, []);
  await act(() => buttons()[1].click());
  assert.equal(buttons()[1].getAttribute("aria-pressed"), "true");
});
