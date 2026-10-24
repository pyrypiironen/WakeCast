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

test("Detailed has three localized columns and preserves selection across refresh", async () => {
  for (const locale of ["en", "fi"]) {
    const input = props(locale);
    const t = translations[locale].currentConditions;

    await render(input);

    assert.equal(buttons()[0].getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelectorAll("table").length, 0);

    const target = buttons()[1].getAttribute("aria-controls");

    await act(() => buttons()[1].click());

    assert.equal(buttons()[1].getAttribute("aria-pressed"), "true");

    const panel = document.getElementById(target);
    assert.equal(panel.querySelectorAll("table").length, 1);

    const table = panel.querySelector("table");
    const headings = [...table.querySelectorAll("thead th")];

    assert.deepEqual(
      headings.map((heading) => heading.firstChild.textContent),
      [t.measurement, t.observations, t.forecastForNow],
    );
    assert.ok(
      headings.every((heading) => heading.getAttribute("scope") === "col"),
    );
    assert.equal(
      table.querySelector("caption").textContent.trim(),
      t.detailedCaption,
    );

    await render({
      ...input,
      nowMs: input.nowMs + 60_000,
      data: fixture(),
    });

    assert.equal(buttons()[1].getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelectorAll("table").length, 1);

    await act(() => buttons()[0].click());

    assert.equal(buttons()[0].getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelectorAll("table").length, 0);
    assert.equal(document.querySelectorAll("dd").length, 7);
  }
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

test("Detailed headings use API locations and the actual current forecast interval", async () => {
  for (const locale of ["en", "fi"]) {
    const input = props(locale);
    const t = translations[locale].currentConditions;

    // Different fixture names ensure the component cannot hardcode stations.
    input.data.observations.data.station_name = "Weather station A";
    input.data.water.data.observation_location = "Water station B";
    input.data.forecasts.data.forecast_location = "Forecast location C";

    await render(input);
    await act(() => buttons()[1].click());

    const headings = () => [
      ...document.querySelectorAll("thead th"),
    ];

    assert.ok(headings()[1].textContent.includes("Weather station A"));
    assert.ok(headings()[1].textContent.includes("*Water station B"));
    assert.ok(headings()[2].textContent.includes("Forecast location C"));
    assert.ok(headings()[2].textContent.includes("19:00–20:00"));

    const nextHour = {
      ...input,
      nowMs: Date.parse("2026-10-19T20:00:00+03:00"),
    };

    await render(nextHour);

    assert.equal(buttons()[1].getAttribute("aria-pressed"), "true");
    assert.ok(headings()[2].textContent.includes("20:00–21:00"));

    // Only a future forecast remains: do not label it as current.
    input.data.forecasts.data.forecasts = [
      {
        ...input.data.forecasts.data.forecasts[1],
        timestamp: "2026-10-19T21:00:00+03:00",
      },
    ];

    await render({
      ...nextHour,
      data: { ...input.data },
    });

    assert.ok(headings()[2].textContent.includes(t.unavailable));
    assert.ok(!headings()[2].textContent.includes("21:00–22:00"));

    await render({
      ...nextHour,
      data: {
        ...input.data,
        observations: { status: "unavailable", httpStatus: 404 },
        water: { status: "unavailable", httpStatus: 404 },
        forecasts: { status: "unavailable", httpStatus: 503 },
      },
    });

    assert.ok(headings()[1].textContent.includes(t.unavailable));
    assert.ok(headings()[2].textContent.includes(t.unavailable));
    assert.ok(!headings()[1].textContent.includes("Weather station A"));
    assert.ok(!headings()[2].textContent.includes("Forecast location C"));

    await act(() => buttons()[0].click());
  }
});

test("Detailed displays seven localized rows with water marked by an asterisk", async () => {
  for (const locale of ["en", "fi"]) {
    const input = props(locale);
    const t = translations[locale].currentConditions;

    await render(input);
    await act(() => buttons()[1].click());

    const rows = [
      ...document.querySelectorAll("[data-detailed-condition]"),
    ];

    assert.deepEqual(
      rows.map((row) => row.dataset.detailedCondition),
      ["temperature", "water", "wind", "gust", "cloud", "rain", "probability"],
    );

    const expected = locale === "fi"
      ? ["8,4 °C", "9,8 °C*", "3,2 m/s", "5,6 m/s", "75 %", "0,4 mm", "—"]
      : ["8.4 °C", "9.8 °C*", "3.2 m/s", "5.6 m/s", "75 %", "0.4 mm", "—"];

    assert.deepEqual(
      rows.map((row) => row.querySelector("td > span").textContent),
      expected,
    );

    for (const row of rows) {
      const heading = row.querySelector('th[scope="row"]');
      assert.ok(
        heading.textContent.includes(t[row.dataset.detailedCondition]),
      );
    }

    const waterCell = rows[1].querySelector("td");
    assert.ok(waterCell.title.includes("Lauttasaaren mattolaituri"));

    const temperatureCell = rows[0].querySelector("td");
    assert.ok(temperatureCell.title.includes("Helsinki Kaisaniemi"));

    await act(() => buttons()[0].click());
    assert.equal(document.querySelectorAll("dd").length, 7);
  }
});

test("Detailed preserves observed zeroes and never fills missing observations with forecasts", async () => {
  const input = props();
  const observation = input.data.observations.data.observations[0];

  observation.temperature = 0;
  observation.wind_speed = 0;
  observation.wind_gust = 0;
  observation.cloudiness = 0;
  input.data.water.data.observations[0].water_temperature = 0;

  await render(input);
  await act(() => buttons()[1].click());

  const observedValue = (key) =>
    document.querySelector(
      `[data-detailed-condition="${key}"] td > span`,
    ).textContent;

  assert.equal(observedValue("temperature"), "0 °C");
  assert.equal(observedValue("water"), "0 °C*");
  assert.equal(observedValue("wind"), "0 m/s");
  assert.equal(observedValue("gust"), "0 m/s");
  assert.equal(observedValue("cloud"), "0 %");

  observation.temperature = null;

  await render({
    ...input,
    data: {
      ...input.data,
      water: { status: "unavailable", httpStatus: 404 },
    },
  });

  // A temperature forecast still exists, but it is not an observation.
  assert.equal(observedValue("temperature"), "—");
  assert.equal(observedValue("water"), "—");
  assert.equal(observedValue("wind"), "0 m/s");
  assert.equal(buttons()[1].getAttribute("aria-pressed"), "true");
});

test("Detailed keeps current-hour forecast values separate from observations in both languages", async () => {
  for (const locale of ["en", "fi"]) {
    const input = props(locale);

    await render(input);
    await act(() => buttons()[1].click());

    const forecastValue = (key) =>
      document.querySelectorAll(
        `[data-detailed-condition="${key}"] td`,
      )[1].querySelector("span").textContent;

    assert.equal(forecastValue("temperature"), "9 °C");
    assert.equal(forecastValue("water"), "—");
    assert.equal(forecastValue("wind"), "4 m/s");
    assert.equal(forecastValue("gust"), "6 m/s");
    assert.equal(forecastValue("cloud"), "80 %");

    const temperatureCells = document.querySelectorAll(
      '[data-detailed-condition="temperature"] td',
    );

    assert.equal(
      temperatureCells[0].querySelector("span").textContent,
      locale === "fi" ? "8,4 °C" : "8.4 °C",
    );
    assert.ok(temperatureCells[0].title.includes("Helsinki Kaisaniemi"));
    assert.ok(temperatureCells[1].title.includes("Karhusaari"));
    assert.ok(temperatureCells[1].title.includes("fmi_edited"));

    await act(() => buttons()[0].click());
  }
});

test("Detailed preserves forecast zeroes and leaves missing current-hour forecasts unavailable", async () => {
  const input = props();
  const forecast = input.data.forecasts.data.forecasts[0];

  forecast.temperature = 0;
  forecast.wind_speed = 0;
  forecast.wind_gust = 0;
  forecast.cloudiness = 0;

  await render(input);
  await act(() => buttons()[1].click());

  const forecastValue = (key) =>
    document.querySelectorAll(
      `[data-detailed-condition="${key}"] td`,
    )[1].querySelector("span").textContent;

  assert.equal(forecastValue("temperature"), "0 °C");
  assert.equal(forecastValue("wind"), "0 m/s");
  assert.equal(forecastValue("gust"), "0 m/s");
  assert.equal(forecastValue("cloud"), "0 %");
  assert.equal(forecastValue("water"), "—");

  // Remove the current hour, leaving only the future 20:00 forecast.
  const futureOnly = {
    ...input.data,
    forecasts: {
      ...input.data.forecasts,
      data: {
        ...input.data.forecasts.data,
        forecasts: [input.data.forecasts.data.forecasts[1]],
      },
    },
  };

  await render({ ...input, data: futureOnly });

  for (const key of ["temperature", "water", "wind", "gust", "cloud"]) {
    assert.equal(forecastValue(key), "—");
  }

  // The same forecast becomes valid when its hour actually starts.
  await render({
    ...input,
    data: futureOnly,
    nowMs: Date.parse("2026-10-19T20:00:00+03:00"),
  });

  assert.equal(forecastValue("temperature"), "9 °C");
  assert.equal(forecastValue("water"), "—");
  assert.equal(buttons()[1].getAttribute("aria-pressed"), "true");

  // A nullable/missing field must not erase other available forecast fields.
  await render({
    ...input,
    data: {
      ...input.data,
      forecasts: {
        ...input.data.forecasts,
        data: {
          ...input.data.forecasts.data,
          forecasts: [{ ...forecast, temperature: null }],
        },
      },
    },
  });

  assert.equal(forecastValue("temperature"), "—");
  assert.equal(forecastValue("wind"), "0 m/s");
});

test("Detailed separates rain intervals and probability, preserving zeroes and missing values", async () => {
  for (const locale of ["en", "fi"]) {
    const input = props(locale);
    const t = translations[locale].currentConditions;

    await render(input);
    await act(() => buttons()[1].click());

    const row = (key) =>
      document.querySelector(`[data-detailed-condition="${key}"]`);

    const cellValue = (key, column) =>
      row(key).querySelectorAll("td")[column]
        .querySelector("span").textContent;

    assert.ok(
      row("rain").querySelector("th").textContent.includes(
        `${t.rain} 18:00–19:00`,
      ),
    );
    assert.equal(
      cellValue("rain", 0),
      locale === "fi" ? "0,4 mm" : "0.4 mm",
    );
    assert.equal(cellValue("rain", 1), "—");

    assert.ok(
      row("probability").querySelector("th").textContent.includes(
        `${t.probability} 19:00–20:00`,
      ),
    );
    assert.equal(cellValue("probability", 0), "—");
    assert.equal(cellValue("probability", 1), "20 %");

    // A later rain sample still describes its own preceding hour.
    const observation = input.data.observations.data.observations[0];
    observation.timestamp = "2026-10-19T19:10:00+03:00";
    observation.precipitation = 0;
    input.data.forecasts.data.forecasts[0].precipitation_probability = 0;

    await render({ ...input, data: { ...input.data } });

    assert.ok(
      row("rain").querySelector("th").textContent.includes("18:10–19:10"),
    );
    assert.equal(cellValue("rain", 0), "0 mm");
    assert.equal(cellValue("probability", 1), "0 %");

    observation.precipitation = null;
    input.data.forecasts.data.forecasts[0].precipitation_probability = null;

    await render({ ...input, data: { ...input.data } });

    assert.equal(cellValue("rain", 0), "—");
    assert.equal(cellValue("probability", 1), "—");
    assert.ok(
      !row("rain").querySelector("th").textContent.includes("18:10–19:10"),
    );

    await act(() => buttons()[0].click());
  }
});
});
