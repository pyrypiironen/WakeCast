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
const row = (key) =>
  document.querySelector(`[data-detailed-condition="${key}"]`);

function cellValue(key, column) {
  const measurementRow = row(key);
  assert.ok(measurementRow, `Missing row: ${key}`);

  const cell = measurementRow.querySelectorAll("td")[column];
  assert.ok(cell, `Missing column ${column} for ${key}`);

  return cell.querySelector("span").textContent;
}

const observedValue = (key) => cellValue(key, 0);
const forecastValue = (key) => cellValue(key, 1);

test("Detailed is the only view and displays seven ordered bilingual rows", async () => {
  for (const locale of ["en", "fi"]) {
    await render(props(locale));
    const t = translations[locale].currentConditions;

    assert.deepEqual(
      [...document.querySelectorAll("[data-detailed-condition]")]
        .map((element) => element.dataset.detailedCondition),
      ["temperature", "water", "wind", "gust", "cloud", "rain", "probability"],
    );

    assert.equal(document.querySelectorAll("button").length, 0);
    assert.equal(document.querySelectorAll("[data-condition]").length, 0);
    assert.equal(document.querySelectorAll("table").length, 1);

    assert.equal(
      observedValue("temperature"),
      locale === "fi" ? "8,4 °C" : "8.4 °C",
    );
    assert.equal(
      observedValue("water"),
      locale === "fi" ? "9,8 °C *" : "9.8 °C *",
    );
    assert.equal(observedValue("probability"), "");
    assert.equal(forecastValue("probability"), "20 %");

    assert.ok(
      row("rain").querySelector("th").textContent.includes(
        `${t.rain} 18:00–19:00`,
      ),
    );

    const probabilityHeading = row("probability").querySelector("th");
    assert.ok(probabilityHeading.textContent.includes(t.probability));
    assert.doesNotMatch(probabilityHeading.textContent, /\d{2}:\d{2}/);

    assert.ok(
      row("temperature").querySelector("td").title.includes(
        "Helsinki Kaisaniemi",
      ),
    );
    assert.ok(
      row("probability").querySelectorAll("td")[1].title.includes(
        "Karhusaari",
      ),
    );

    const waterValue = row("water").querySelector("td > span");
    const waterNote = document.getElementById(
      waterValue.getAttribute("aria-describedby"),
    );

    assert.ok(waterNote);
    assert.equal(
      waterNote.querySelector("time").dateTime,
      "2026-10-19T18:32:00+03:00",
    );

    const sources = document.querySelector("details[data-current-sources]");
    assert.ok(sources);
    assert.equal(sources.open, false);
    assert.equal(sources.querySelector("summary").textContent, t.dataSources);

    sources.querySelector("summary").focus();
    assert.equal(document.activeElement, sources.querySelector("summary"));
  }
});

test("Detailed has three localized columns and updates without replacing the table", async () => {
  for (const locale of ["en", "fi"]) {
    const input = props(locale);
    const t = translations[locale].currentConditions;

    await render(input);

    const table = document.querySelector("table");
    assert.ok(table);

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

    const refreshed = fixture();
    refreshed.observations.data.observations[0].temperature = 7;

    await render({
      ...input,
      nowMs: input.nowMs + 60_000,
      data: refreshed,
    });

    assert.equal(document.querySelector("table"), table);
    assert.equal(document.querySelectorAll("table").length, 1);
    assert.equal(observedValue("temperature"), "7 °C");
    assert.equal(document.querySelectorAll("button").length, 0);
  }
});

test("Detailed preserves missing values, zeroes and cached measurement timestamps after refresh failure", async () => {
  const input = props();

  input.data.observations.data.observations[0].temperature = null;
  input.data.observations.data.observations[0].precipitation = 0;
  input.data.forecasts.data.forecasts[0].precipitation_probability = 0;

  await render(input);

  assert.equal(observedValue("temperature"), "—");
  assert.equal(observedValue("rain"), "0 mm");
  assert.equal(forecastValue("probability"), "0 %");

  await render({
    ...input,
    nowMs: Date.parse("2026-10-19T21:30:00+03:00"),
    refreshFailed: true,
  });

  assert.equal(observedValue("water"), "9.8 °C *");
  assert.equal(
    document.querySelector(
      '[data-current-sources] [data-source-fields="water"] time[data-measured]',
    ).dateTime,
    "2026-10-19T18:32:00+03:00",
  );
  assert.ok(
    document.querySelector('[role="status"]').textContent.includes(
      translations.en.currentConditions.refreshFailed,
    ),
  );
  assert.equal(forecastValue("probability"), "—");
});

test("hour rolls forward without borrowing a different forecast period", async () => {
  const input = props();

  await render(input);

  assert.equal(forecastValue("probability"), "20 %");
  assert.equal(
    document.querySelector("thead time").textContent,
    "19:00–20:00",
  );

  await render({
    ...input,
    nowMs: Date.parse("2026-10-19T20:00:00+03:00"),
  });

  assert.equal(forecastValue("probability"), "40 %");
  assert.equal(
    document.querySelector("thead time").textContent,
    "20:00–21:00",
  );
});

test("server markup hydrates without mismatches and Data sources remains interactive", async () => {
  const input = props();
  const container = document.createElement("div");

  container.innerHTML = renderToString(
    React.createElement(CurrentConditions, input),
  );
  document.body.append(container);

  const errors = [];

  await act(() => {
    root = hydrateRoot(
      container,
      React.createElement(CurrentConditions, input),
      { onRecoverableError: (error) => errors.push(error) },
    );
  });

  assert.deepEqual(errors, []);
  assert.equal(container.querySelectorAll("table").length, 1);

  const sources = container.querySelector("details[data-current-sources]");
  assert.ok(sources);
  assert.equal(sources.open, false);

  await act(() => sources.querySelector("summary").click());
  assert.equal(sources.open, true);

  await act(() => sources.querySelector("summary").click());
  assert.equal(sources.open, false);

  assert.deepEqual(errors, []);
});

test("Detailed headings use API locations and the actual current forecast interval", async () => {
  for (const locale of ["en", "fi"]) {
    const input = props(locale);
    const t = translations[locale].currentConditions;

    // Different fixture names ensure the component cannot hardcode stations.
    input.data.observations.data.station_name = "Weather station A";
    input.data.observations.data.source_station_id = 999999;
    input.data.water.data.observation_location = "Water station B";
    input.data.forecasts.data.forecast_location = "Forecast location C";

    await render(input);

    const headings = () => [
      ...document.querySelectorAll("thead th"),
    ];

    assert.ok(headings()[1].textContent.includes("Weather station A"));
    assert.ok(!headings()[1].textContent.includes("*Water station B"));
    assert.ok(headings()[2].textContent.includes("Forecast location C"));
    assert.ok(headings()[2].textContent.includes("19:00–20:00"));

    const nextHour = {
      ...input,
      nowMs: Date.parse("2026-10-19T20:00:00+03:00"),
    };

    await render(nextHour);

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

  }
});

test("Detailed displays seven localized rows with water marked by an asterisk", async () => {
  for (const locale of ["en", "fi"]) {
    const input = props(locale);
    const t = translations[locale].currentConditions;

    await render(input);

    const rows = [
      ...document.querySelectorAll("[data-detailed-condition]"),
    ];

    assert.deepEqual(
      rows.map((row) => row.dataset.detailedCondition),
      ["temperature", "water", "wind", "gust", "cloud", "rain", "probability"],
    );

    const expected = locale === "fi"
      ? ["8,4 °C", "9,8 °C *", "3,2 m/s", "5,6 m/s", "75 %", "0,4 mm", ""]
      : ["8.4 °C", "9.8 °C *", "3.2 m/s", "5.6 m/s", "75 %", "0.4 mm", ""];

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

  assert.equal(document.querySelectorAll("[data-condition]").length, 0);
  assert.equal(document.querySelectorAll("tbody tr").length, 7);
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

  const observedValue = (key) =>
    document.querySelector(
      `[data-detailed-condition="${key}"] td > span`,
    ).textContent;

  assert.equal(observedValue("temperature"), "0 °C");
  assert.equal(observedValue("water"), "0 °C *");
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
});

test("Detailed keeps current-hour forecast values separate from observations in both languages", async () => {
  for (const locale of ["en", "fi"]) {
    const input = props(locale);

    await render(input);

    const forecastValue = (key) =>
      document.querySelectorAll(
        `[data-detailed-condition="${key}"] td`,
      )[1].querySelector("span").textContent;

    assert.equal(forecastValue("temperature"), "9 °C");
    assert.equal(forecastValue("water"), "");
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

  const forecastValue = (key) =>
    document.querySelectorAll(
      `[data-detailed-condition="${key}"] td`,
    )[1].querySelector("span").textContent;

  assert.equal(forecastValue("temperature"), "0 °C");
  assert.equal(forecastValue("wind"), "0 m/s");
  assert.equal(forecastValue("gust"), "0 m/s");
  assert.equal(forecastValue("cloud"), "0 %");
  assert.equal(forecastValue("water"), "");

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

  for (const key of ["temperature", "wind", "gust", "cloud"]) {
    assert.equal(forecastValue(key), "—");
  }

  assert.equal(forecastValue("water"), "");

  // The same forecast becomes valid when its hour actually starts.
  await render({
    ...input,
    data: futureOnly,
    nowMs: Date.parse("2026-10-19T20:00:00+03:00"),
  });

  assert.equal(forecastValue("temperature"), "9 °C");
  assert.equal(forecastValue("water"), "");

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
    assert.equal(cellValue("rain", 1), "");

    assert.ok(
      row("probability").querySelector("th").textContent.includes(
        `${t.probability}`,
      ),
    );
    assert.equal(cellValue("probability", 0), "");
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

  }
});

test("source dropdown contains grouped timestamps while Detailed cells remain compact", async () => {
  for (const locale of ["en", "fi"]) {
    const input = props(locale);
    const t = translations[locale].currentConditions;

    await render(input);

    const sources = () =>
      document.querySelector("details[data-current-sources]");

    const measuredTime = (key) =>
      sources().querySelector(
        `[data-source-fields~="${key}"] time[data-measured]`,
      );

    assert.equal(sources().open, false);
    assert.equal(sources().querySelector("summary").textContent, t.dataSources);

    await act(() => sources().querySelector("summary").click());
    assert.equal(sources().open, true);

    assert.equal(
      measuredTime("temperature").dateTime,
      "2026-10-19T19:00:00+03:00",
    );
    assert.equal(
      measuredTime("water").dateTime,
      "2026-10-19T18:32:00+03:00",
    );

    // Equal source/sample/fetch metadata is grouped.
    assert.equal(measuredTime("temperature"), measuredTime("wind"));

    assert.equal(
      sources().querySelector("time[data-forecast-retrieved]").dateTime,
      "2026-10-19T19:07:00+03:00",
    );


    assert.equal(document.querySelectorAll("tbody time").length, 0);
    assert.equal(
      document.querySelectorAll("thead time[data-forecast-retrieved]").length,
      0,
    );
    assert.equal(document.querySelector("thead time").textContent, "19:00–20:00");
    assert.equal(sources().open, true);

    // A different observation time gets its own group.
    const changed = fixture();
    changed.observations.data.observations.push({
      ...changed.observations.data.observations[0],
      timestamp: "2026-10-19T19:10:00+03:00",
      temperature: null,
    });

    await render({ ...input, data: changed });

    assert.equal(
      measuredTime("temperature").dateTime,
      "2026-10-19T19:00:00+03:00",
    );
    assert.equal(
      measuredTime("wind").dateTime,
      "2026-10-19T19:10:00+03:00",
    );
    assert.notEqual(measuredTime("temperature"), measuredTime("wind"));
    assert.equal(sources().open, true);

    await act(() => sources().querySelector("summary").click());
  }
});

test("source timestamps use compact times, retain older dates and disappear when unavailable", async () => {
  const input = props();
  input.nowMs = Date.parse("2026-10-25T03:30:00+02:00");

  const waterTime = () =>
    document.querySelector(
      '[data-current-sources] [data-source-fields="water"] time[data-measured]',
    );

  input.data.water.data.observations[0].timestamp =
    "2026-10-25T03:10:00+03:00";

  await render(input);

  assert.equal(waterTime().textContent, "03:10");
  assert.equal(
    waterTime().dateTime,
    "2026-10-25T03:10:00+03:00",
  );

  const second = fixture();
  second.water.data.observations[0].timestamp =
    "2026-10-25T03:10:00+02:00";

  await render({ ...input, data: second });

  // The visible label is identical; the actual timestamp remains distinct.
  assert.equal(waterTime().textContent, "03:10");
  assert.equal(
    waterTime().dateTime,
    "2026-10-25T03:10:00+02:00",
  );

  const older = fixture();
  older.water.data.observations[0].timestamp =
    "2026-10-24T18:32:00+03:00";

  await render({ ...input, data: older });

  assert.match(waterTime().textContent, /2026/);
  assert.ok(waterTime().textContent.includes(" · 18:32"));
  assert.ok(!waterTime().textContent.includes("GMT"));

  await render({
    ...input,
    data: {
      ...input.data,
      water: { status: "unavailable", httpStatus: 404 },
      forecasts: { status: "unavailable", httpStatus: 503 },
    },
  });

  assert.equal(waterTime(), null);
  assert.equal(
    document.querySelector(
      "[data-current-sources] time[data-forecast-retrieved]",
    ),
    null,
  );

  assert.equal(waterTime(), null);
  assert.equal(
    document.querySelector("[data-current-sources] time[data-forecast-retrieved]"),
    null,
  );
});

test("Detailed water asterisk links to a visible API-driven explanation", async () => {
  for (const locale of ["en", "fi"]) {
    const input = props(locale);
    const t = translations[locale].currentConditions;
    const location = "Water station B";

    input.data.water.data.observation_location = location;

    await render(input);

    const value = document.querySelector(
      '[data-detailed-condition="water"] td > span',
    );

    assert.ok(value.textContent.endsWith(" °C *"));

    const noteId = value.getAttribute("aria-describedby");
    assert.ok(noteId);

    const note = document.getElementById(noteId);
    assert.ok(note);
        assert.equal(note.textContent, `* ${location} 18:32`);

    const sources = document.querySelector("[data-current-sources]");
    assert.equal(sources.previousElementSibling, note);
    assert.equal(note.closest("details"), null);

    const forecastSection = sources.querySelector(
      '[data-source-fields="forecast"]',
    );
    assert.ok(!forecastSection.textContent.includes(t.forecastScope));

    await render({
      ...input,
      nowMs: input.nowMs + 60_000,
      data: { ...input.data },
    });

assert.equal(document.getElementById(noteId), note);
assert.equal(note.querySelector("time").textContent, "18:32");
  }
});

test("Detailed uses the compact station name while Data sources retains the full name", async () => {
  for (const locale of ["en", "fi"]) {
    await render(props(locale));

    const observationsHeading =
      document.querySelectorAll("thead th")[1];

    assert.ok(observationsHeading.textContent.includes("Kaisaniemi"));
    assert.ok(
      !observationsHeading.textContent.includes("Helsinki Kaisaniemi"),
    );

    const sources = document.querySelector("[data-current-sources]");
    assert.ok(sources.textContent.includes("Helsinki Kaisaniemi"));

  }
});

test("Observations heading shows the actual weather measurement time or range", async () => {
  for (const locale of ["en", "fi"]) {
    const input = props(locale);

    // Rain and water must not influence the weather heading's time.
    input.data.observations.data.observations[0].precipitation = null;
    input.data.observations.data.observations.push({
      ...input.data.observations.data.observations[0],
      timestamp: "2026-10-19T18:00:00+03:00",
      temperature: null,
      wind_speed: null,
      wind_gust: null,
      cloudiness: null,
      precipitation: 0.4,
    });

    await render(input);

    const headingTime = () =>
      document.querySelector("[data-observation-range]").textContent;

    assert.equal(headingTime(), "19:00");

    // Temperature stays at 19:00; other weather readings advance to 19:10.
    const updated = fixture();
    updated.observations.data.observations.push({
      ...updated.observations.data.observations[0],
      timestamp: "2026-10-19T19:10:00+03:00",
      temperature: null,
    });

    await render({ ...input, data: updated });

    assert.equal(headingTime(), "19:00–19:10");

    // Zero is an available measurement and must retain its timestamp.
    const zero = fixture();
    Object.assign(zero.observations.data.observations[0], {
      temperature: 0,
      wind_speed: null,
      wind_gust: null,
      cloudiness: null,
    });

    await render({ ...input, data: zero });

    assert.equal(headingTime(), "19:00");

    // Forecast and water data cannot supply the observation timestamp.
    await render({
      ...input,
      data: {
        ...input.data,
        observations: { status: "unavailable", httpStatus: 503 },
      },
    });

    assert.equal(headingTime(), "—");

  }
});

test("Current availability stays hidden for complete data, including valid zeroes", async () => {
  const input = props();
  const observation = input.data.observations.data.observations[0];
  const forecast = input.data.forecasts.data.forecasts[0];

  Object.assign(observation, {
    temperature: 0,
    wind_speed: 0,
    wind_gust: 0,
    cloudiness: 0,
    precipitation: 0,
  });

  input.data.water.data.observations[0].water_temperature = 0;

  Object.assign(forecast, {
    temperature: 0,
    wind_speed: 0,
    wind_gust: 0,
    cloudiness: 0,
    precipitation_probability: 0,
  });

  await render(input);

  assert.equal(
    document.querySelector("[data-current-availability]"),
    null,
  );
});

test("Current availability is bilingual, collapsed by default and clears after refresh", async () => {
  for (const locale of ["en", "fi"]) {
    const input = props(locale);
    input.data.forecasts.data.forecasts[0].precipitation_probability = null;

    await render(input);

    const disclosure = document.querySelector("[data-current-availability]");
    assert.ok(disclosure);
    assert.equal(disclosure.open, false);
    assert.equal(disclosure.querySelectorAll("li").length, 1);
    assert.ok(
      disclosure.textContent.includes(
        translations[locale].currentConditions.probability,
      ),
    );
    assert.ok(
      disclosure.querySelector("summary").textContent.includes(
        locale === "fi" ? "Tietojen saatavuus" : "Data availability",
      ),
    );

    await act(() => disclosure.querySelector("summary").click());
    assert.equal(disclosure.open, true);

    await render({ ...input, nowMs: input.nowMs + 60_000 });
    assert.equal(
      document.querySelector("[data-current-availability]"),
      disclosure,
    );
    assert.equal(disclosure.open, true);

    await render({ ...input, data: fixture() });
    assert.equal(
      document.querySelector("[data-current-availability]"),
      null,
    );
  }
});

test("Current availability reports a failed weather source once", async () => {
  const input = props();
  input.data.observations = {
    status: "unavailable",
    httpStatus: 503,
  };

  await render(input);

  const notices = [
    ...document.querySelectorAll("[data-current-availability] li"),
  ];

  assert.deepEqual(
    notices.map((notice) => notice.textContent),
    ["Weather observations are unavailable."],
  );
});

test("Current availability accepts the latest completed rainfall hour despite newer weather observations", async () => {
  const input = props();

  input.data.observations.data.observations.push({
    ...input.data.observations.data.observations[0],
    timestamp: "2026-10-19T19:10:00+03:00",
    precipitation: null,
  });

  await render(input);

  // At 19:20, rainfall for 18:00–19:00 is still valid.
  assert.equal(
    document.querySelector("[data-current-availability]"),
    null,
  );
  assert.ok(
    document.querySelector(
      '[data-detailed-condition="rain"] th',
    ).textContent.includes("18:00–19:00"),
  );
});
