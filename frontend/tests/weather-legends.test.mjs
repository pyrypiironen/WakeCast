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
const Chart = require("../src/components/DailyWeatherChart.tsx").default;
const { chartWeatherAvailability, prepareDailyWeatherChart } = require("../src/components/daily-weather-chart-data.ts");
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

const keys = ["temperature", "water", "cloud", "wind_speed", "wind_gust", "precipitationProbability"];
const time = (hour, day = "17") => `2026-10-${day}T${String(hour).padStart(2, "0")}:00:00+03:00`;
function fixture() {
  const weather = (timestamp, source) => ({ timestamp, fetched_at: timestamp, temperature: 12, wind_speed: 4, wind_gust: 7, wind_direction: 180, precipitation: 0, precipitation_probability: 0, cloudiness: 50, source, observation_location: "Test station", resolution_minutes: 60, is_aggregated: false });
  const forecasts = Array.from({ length: 14 }, (_, index) => weather(index === 13 ? time(0, "18") : time(index + 11), index < 2 ? "fmi_edited" : "ecmwf"));
  return {
    selectedDate: "2026-10-17", timeZone: "Europe/Helsinki", locale: "en", chartWindow: "12h",
    data: {
      today: "2026-10-17", earliestDate: "2026-10-14", latestDate: "2026-10-27", requestedAt: "2026-10-17T10:30:00+03:00",
      observations: { status: "ok", data: { station_name: "Test station", source: "fmi", source_station_id: 1, timezone: "Europe/Helsinki", observations: [weather(time(9), "fmi"), weather(time(10), "fmi")] } },
      forecasts: { status: "ok", data: { forecast_location: "Test", fetched_at: time(10), coverage_start: time(11), coverage_end: time(0, "18"), forecasts } },
      water: { status: "ok", data: { observation_location: "Water station", source: "uiras", source_station_id: "1", latitude: 60, longitude: 24, timezone: "Europe/Helsinki", preceding_observation: null, observations: [9, 10].map(hour => ({ timestamp: time(hour), fetched_at: time(hour), water_temperature: 11 })) } },
    },
  };
}
async function render(props) {
  if (!root) {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  await act(() => root.render(React.createElement(Chart, props)));
}
const buttons = () => [...document.querySelectorAll("button")];
const layer = key => document.querySelectorAll(`[data-weather-layer="${key}"]`);
const click = async index => act(() => buttons()[index].click());

test("six enabled native buttons in two ordered bilingual rows, between graph and sources", async () => {
  for (const locale of ["en", "fi"]) {
    await render({ ...fixture(), locale });
    const t = translations[locale].dailyForecast;
    const legend = document.querySelector('[role="group"]');
    assert.equal(legend.getAttribute("aria-label"), t.legend);
    assert.deepEqual([...legend.querySelectorAll("ul")].map(row => row.querySelectorAll("button").length), [3, 3]);
    assert.deepEqual(buttons().map(button => button.getAttribute("aria-label")), [t.air + " (°C)", t.water + " (°C)", t.cloud + " (%)", t.wind + " (m/s)", t.gust + " (m/s)", t.precipitationProbability + " (%)"]);
    assert.ok(buttons().every(button => button.type === "button" && button.getAttribute("aria-pressed") === "true" && button.dataset.available === "true"));
    assert.ok(document.querySelector("svg").compareDocumentPosition(legend) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(legend.nextElementSibling.tagName, "P");
    assert.ok(legend.nextElementSibling.textContent.startsWith(t.forecasts));
    buttons()[0].focus();
    assert.equal(document.activeElement, buttons()[0]);
  }
});

for (const [index, key] of keys.entries()) {
  test(`${key}: independently hides actual SVG layer and restores identical rendering`, async () => {
    const props = fixture();
    const unchangedData = JSON.stringify(props.data);
    await render(props);
    const svg = document.querySelector("svg").outerHTML;
    assert.ok(layer(key).length);
    const otherLayers = new Map(keys.filter(item => item !== key).map(item => [item, [...layer(item)].map(node => node.outerHTML)]));
    await click(index);
    assert.equal(buttons()[index].getAttribute("aria-pressed"), "false");
    assert.equal(layer(key).length, 0);
    for (const [other, markup] of otherLayers) assert.deepEqual([...layer(other)].map(node => node.outerHTML), markup);
    if (["temperature", "wind_speed", "wind_gust"].includes(key)) {
      assert.equal(document.querySelector(`line[data-weather-layer="${key}"]`), null);
    }
    await click(index);
    assert.equal(buttons()[index].getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelector("svg").outerHTML, svg);
    assert.equal(JSON.stringify(props.data), unchangedData);
  });
}

test("choices persist across day, chart-window, locale and refreshed-data props", async () => {
  const props = fixture();
  await render(props);
  await click(0);
  await click(5);
  for (const changes of [
    { selectedDate: "2026-10-18" },
    { chartWindow: "24h" },
    { data: { ...structuredClone(props.data), requestedAt: "2026-10-17T10:35:00+03:00" } },
    { locale: "fi" },
    {},
  ]) {
    await render({ ...props, ...changes });
    assert.deepEqual(buttons().map(button => button.getAttribute("aria-pressed")), ["false", "true", "true", "true", "true", "false"]);
    assert.equal(layer("temperature").length, 0);
    assert.equal(layer("precipitationProbability").length, 0);
  }
});

test("unavailable/empty/null sources stay distinct from intentionally hidden variables", async () => {
  for (const locale of ["en", "fi"]) {
    const props = { ...fixture(), locale };
    props.data.observations = { status: "error", httpStatus: null };
    props.data.forecasts.data.forecasts = props.data.forecasts.data.forecasts.map(point => ({ ...point, temperature: null, wind_speed: null, wind_gust: null, cloudiness: null, precipitation_probability: null }));
    props.data.water = { status: "unavailable", httpStatus: 503 };
    await render(props);
    assert.ok(buttons().every(button => button.dataset.available === "false"));
    for (const button of buttons()) assert.equal(button.getAttribute("aria-description"), translations[locale].dailyForecast.noDataInView);
    await click(0);
    assert.equal(buttons()[0].getAttribute("aria-pressed"), "false");
    await click(0);
    assert.equal(buttons()[0].getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelectorAll('polyline, [data-weather-layer="water"] circle').length, 0);
  }
});

test("availability follows visible segments, including zero values, bridges and water endpoints", () => {
  const chart = prepareDailyWeatherChart(fixture());
  assert.ok(Object.values(chartWeatherAvailability(chart)).every(Boolean));
  // A valid 0% is available, not missing; past probability boxes are not displayed.
  chart.precipitationCells.forEach(cell => { cell.probability = 0; });
  assert.equal(chartWeatherAvailability(chart).precipitationProbability, true);
  chart.precipitationCells.forEach(cell => { cell.isPast = true; });
  assert.equal(chartWeatherAvailability(chart).precipitationProbability, false);
  chart.cloudSeries.forEach(segment => segment.forEach(point => { point.value = 0; }));
  assert.equal(chartWeatherAvailability(chart).cloud, true);
  const before = chart.startMs - 1000;
  chart.waterPoints = [{ time: before, value: 11 }];
  assert.equal(chartWeatherAvailability(chart).water, false);
  chart.series = [];
  chart.startMs = Date.parse(time(10)) + 1000;
  chart.endMs = Date.parse(time(11)) - 1000;
  assert.equal(chartWeatherAvailability(chart).temperature, true); // bridge crosses window
  chart.transitionLines = [];
  assert.equal(chartWeatherAvailability(chart).temperature, false);
  chart.cloudSeries = [[{ time: chart.startMs, value: 50 }]];
  chart.cloudBridge = null;
  assert.equal(chartWeatherAvailability(chart).cloud, false); // single point draws no shading
});

test("24h midnight endpoint, source markers, axes and measured/forecast styles survive toggles", async () => {
  await render({ ...fixture(), chartWindow: "24h" });
  const temperature = document.querySelector('[data-weather-layer="temperature"] polyline[stroke-dasharray]');
  assert.match(temperature.getAttribute("points"), /848,/);
  assert.ok(document.querySelector('line[data-weather-layer="temperature"][stroke-dasharray="6 4"]'));
  assert.ok(document.querySelector('[data-weather-layer="temperature"] polyline:not([stroke-dasharray])'));
  assert.ok(document.querySelector("svg").textContent.includes("24:00"));
  const sourceMarker = document.querySelector(".sourceMarker").outerHTML;
  const axis = document.querySelector(".axis").outerHTML;
  const waterPath = document.querySelector('[data-weather-layer="water"] path').getAttribute("d");
  assert.ok(!waterPath.includes("848"));
  for (let index = 0; index < 6; index++) await click(index);
  assert.equal(document.querySelector(".sourceMarker").outerHTML, sourceMarker);
  assert.equal(document.querySelector(".axis").outerHTML, axis);
});

test("server markup hydrates without mismatches and remains interactive", async () => {
  const props = fixture();
  const container = document.createElement("div");
  container.innerHTML = renderToString(React.createElement(Chart, props));
  document.body.append(container);
  const errors = [];
  await act(() => { root = hydrateRoot(container, React.createElement(Chart, props), { onRecoverableError: error => errors.push(error) }); });
  assert.deepEqual(errors, []);
  await click(0);
  assert.equal(layer("temperature").length, 0);
});
