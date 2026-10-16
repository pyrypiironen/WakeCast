import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";

// Synthetic API fixtures, never real weather or provider requests.
const park = {
  id: 1, name: "Test Wakepark", slug: "test-park", city: "Espoo", country: "Finland",
  latitude: 60.16905, longitude: 24.833173, water_type: "sea",
  website_url: "https://example.com/en/park", website_url_fi: "https://example.com/fi/park",
  timezone: "Europe/Helsinki", is_active: true,
  cables: [
    { name: "Pro Cable", booking_url: "https://example.com/en/pro", booking_url_fi: "https://example.com/fi/pro" },
    { name: "Easy Cable", booking_url: "https://example.com/en/easy", booking_url_fi: null },
  ],
};

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

test("production park routes with controlled API responses", { timeout: 60_000 }, async (t) => {
  await access(".next/BUILD_ID"); // Run npm run build before test:parks.
  const requests = [];
  const api = createServer((request, response) => {
    requests.push(request.url);

    const url = new URL(request.url, "http://mock.test");
    const match = url.pathname.match(/^\/api\/parks\/([^/]+)(\/.*)?$/);

    response.setHeader("Content-Type", "application/json");

    if (!match) {
      response.writeHead(404).end(JSON.stringify({ detail: "Unknown route" }));
      return;
    }

    const slug = decodeURIComponent(match[1]);
    const endpoint = match[2] ?? "";
    const timestamp = new Date().toISOString();

    if (endpoint === "/weather") {
      response.end(JSON.stringify({
        forecast_location: "Test forecast location",
        fetched_at: timestamp,
        coverage_start: timestamp,
        coverage_end: timestamp,
        forecasts: [{
          timestamp,
          temperature: 12,
          wind_speed: 4,
          wind_gust: 7,
          wind_direction: 180,
          precipitation: 0,
          precipitation_probability: null,
          cloudiness: 50,
          source: "ecmwf",
        }],
      }));
      return;
    }

    if (endpoint === "/weather/observations") {
      response.end(JSON.stringify({
        station_name: "Test weather station",
        source: "fmi",
        source_station_id: 123,
        timezone: park.timezone,
        observations: [],
      }));
      return;
    }

    if (endpoint === "/water-temperature/history") {
      if (slug === "weather-partial") {
        response.writeHead(503).end(JSON.stringify({
          detail: "Private upstream detail",
        }));
        return;
      }

      response.end(JSON.stringify({
        observation_location: "Test water station",
        source: "uiras",
        source_station_id: "test-water-station",
        latitude: 60.17,
        longitude: 24.85,
        timezone: park.timezone,
        observations: [],
        preceding_observation: null,
      }));
      return;
    }

    if (endpoint !== "") {
      response.writeHead(404).end(JSON.stringify({ detail: "Unknown route" }));
      return;
    }

    if (slug === "missing") {
      response.writeHead(404).end(JSON.stringify({ detail: "Park not found" }));
    } else if (slug === "unavailable") {
      response.writeHead(503).end(JSON.stringify({ detail: "Private upstream detail" }));
    } else if (slug === "invalid-json") {
      response.end("not JSON");
    } else if (slug === "network-error") {
      request.socket.destroy();
    } else {
      const record = { ...park, slug };

      if (slug === "fallback") record.website_url_fi = null;
      if (slug === "empty") {
        record.cables = [];
        record.is_active = false;
        record.water_type = "lake";
      }
      if (slug === "unnamed") {
        record.cables = [{ ...park.cables[0], name: null }];
      }

      response.end(JSON.stringify(record));
    }
  });
  const apiPort = await listen(api);
  const reservation = createServer();
  const appPort = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(appPort)], {
    env: { ...process.env, WAKECAST_API_URL: `http://127.0.0.1:${apiPort}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  app.stdout.on("data", (data) => { output += data; });
  app.stderr.on("data", (data) => { output += data; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Next startup timed out: ${output}`)), 20_000);
      app.stdout.on("data", () => {
        if (output.includes("Ready")) { clearTimeout(timer); resolve(); }
      });
      app.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Next exited ${code}: ${output}`)); });
      app.once("error", (error) => { clearTimeout(timer); reject(error); });
    });
    const read = async (locale, slug) => {
      const response = await fetch(`http://127.0.0.1:${appPort}/${locale}/parks/${slug}`);
      return { status: response.status, html: await response.text() };
    };

    for (const locale of ["en", "fi"]) {
      await t.test(`${locale}: metadata, localized URLs, language navigation and weather slots`, async () => {
        const { status, html } = await read(locale, "test-park");
        assert.equal(status, 200);
        assert.ok(html.includes(`lang="${locale}"`));
        assert.match(html, /<h1[^>]*>Test Wakepark<\/h1>/);
        for (const text of ["Espoo", "Finland", "Europe/Helsinki", "Pro Cable", "Easy Cable"]) assert.ok(html.includes(text));
        for (const language of ["en", "fi"]) assert.ok(html.includes(`href="/${language}/parks/test-park"`));
        assert.ok(html.includes(`href="https://example.com/${locale}/park"`));
        assert.ok(html.includes(`href="https://example.com/${locale}/pro"`));
        assert.ok(html.includes('href="https://example.com/en/easy"'));
        for (const id of ["current-conditions", "daily-forecast", "weekly-forecast", "detailed-weather", "park-booking"]) {
          assert.ok(html.includes(`aria-labelledby="${id}"`));
        }
        assert.equal((html.match(/<main\b/g) ?? []).length, 1);
        assert.doesNotMatch(html, /<table\b|<canvas\b|target="_blank"/);
      });

      await t.test(`${locale}: unknown park is a localized HTTP 404`, async () => {
        const { status, html } = await read(locale, "missing");
        assert.equal(status, 404);
        assert.ok(html.includes(locale === "fi" ? "Puistoa ei löytynyt" : "Park not found"));
        // Next 16.4 sends an HTTP 404 shell and hydrates the not-found boundary
        // from Flight data. Check the actual serialized boundary, not SSR markup.
        const flight = [...html.matchAll(/self\.__next_f\.push\((.*?)\)<\/script>/g)]
          .map((match) => JSON.parse(match[1]))
          .filter(([type]) => type === 1)
          .map(([, payload]) => payload).join("");
        assert.ok(flight.includes('"id":"park-not-found-title"'));
        assert.ok(flight.includes(`"href":"/${locale}"`));
        assert.match(html, /name="robots" content="noindex"/);
      });

      await t.test(`${locale}: API failure has retry, not a false 404 or leaked details`, async () => {
        for (const slug of ["unavailable", "invalid-json", "network-error"]) {
          const { status, html } = await read(locale, slug);
          assert.equal(status, 200);
          assert.ok(html.includes(locale === "fi" ? "Puiston tiedot eivät ole saatavilla" : "Park information unavailable"));
          assert.ok(html.includes(`href="/${locale}/parks/${slug}"`));
          assert.doesNotMatch(html, /Private upstream detail/);
        }
      });
    }
    
    for (const locale of ["en", "fi"]) {
      await t.test(`${locale}: water failure preserves forecast and empty-history states`, async () => {
        const { status, html } = await read(locale, "weather-partial");
        assert.equal(status, 200);
        assert.match(html, /<h1[^>]*>Test Wakepark<\/h1>/);

        const labels = locale === "fi"
          ? {
              forecast: "Ennuste",
              observations: "Säähavainnot",
              water: "Veden lämpötilahavainnot",
              available: "Tietoja saatavilla",
              empty: "Ei tietoja valitulle päivälle",
              unavailable: "Tietolähde ei ole saatavilla",
            }
          : {
              forecast: "Forecast",
              observations: "Weather observations",
              water: "Water-temperature observations",
              available: "Data available",
              empty: "No data for the selected day",
              unavailable: "Data source unavailable",
            };

        for (const [label, message] of [
          [labels.forecast, labels.available],
          [labels.observations, labels.empty],
          [labels.water, labels.unavailable],
        ]) {
          assert.match(
            html,
            new RegExp(`<dt[^>]*>${label}</dt>\\s*<dd[^>]*>${message}</dd>`),
          );
        }

        assert.ok(html.includes(`href="https://example.com/${locale}/pro"`));
        assert.doesNotMatch(html, /Private upstream detail/);
      });
    }

    await t.test("Finnish website falls back to default URL", async () => {
      const { html } = await read("fi", "fallback");
      assert.ok(html.includes('href="https://example.com/en/park"'));
    });
    await t.test("empty cable data and inactive flag do not invent availability", async () => {
      const { html } = await read("fi", "empty");
      assert.ok(html.includes("kaapelitietoja ei ole saatavilla"));
      assert.ok(html.includes("Puisto on merkitty epäaktiiviseksi"));
      assert.ok(html.includes("Järvi"));
      assert.doesNotMatch(html, /href="https:\/\/example.com\/en\/pro"/);
    });
    await t.test("nullable cable name has a localized, identifiable booking label", async () => {
      const { html } = await read("fi", "unnamed");
      assert.ok(html.includes("Kaapeli 1"));
      assert.ok(html.includes('href="https://example.com/fi/pro"'));
    });
    await t.test("unsupported locale returns 404", async () => {
      assert.equal((await read("de", "test-park")).status, 404);
    });
    await t.test("park page loads metadata and all three weather sources", async () => {
      const before = requests.length;
      const { status } = await read("en", "request-check");
      assert.equal(status, 200);

      const calls = requests.slice(before).map(
        (path) => new URL(path, "http://mock.test"),
      );

      assert.deepEqual(
        calls.map((url) => url.pathname).sort(),
        [
          "/api/parks/request-check",
          "/api/parks/request-check/weather",
          "/api/parks/request-check/weather/observations",
          "/api/parks/request-check/water-temperature/history",
        ].sort(),
      );

      const histories = calls.filter((url) =>
        url.searchParams.has("start_time"),
      );
      assert.equal(histories.length, 2);

      for (const url of histories) {
        const start = url.searchParams.get("start_time");
        const end = url.searchParams.get("end_time");

        assert.match(start, /Z$/);
        assert.match(end, /Z$/);
        assert.ok(Date.parse(start) < Date.parse(end));
      }

      assert.equal(
        histories[0].searchParams.get("start_time"),
        histories[1].searchParams.get("start_time"),
      );
      assert.equal(
        histories[0].searchParams.get("end_time"),
        histories[1].searchParams.get("end_time"),
      );
    });
  } finally {
    app.kill();
    if (app.exitCode === null) await once(app, "exit");
    await new Promise((resolve) => api.close(resolve));
  }
});
