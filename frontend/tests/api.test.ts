import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ApiError, getPark, getParks, getParkWeather, getParkWeatherObservations, getParkWaterTemperature, getParkWaterTemperatureHistory } from "../src/lib/api";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.WAKECAST_API_URL;
beforeEach(() => { process.env.WAKECAST_API_URL = "http://localhost:8000/"; });
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.WAKECAST_API_URL;
  else process.env.WAKECAST_API_URL = originalUrl;
});

test("all public read routes use encoded slugs, no-store and a timeout", async () => {
  const paths: string[] = [];
  globalThis.fetch = async (url, init) => {
    paths.push(new URL(String(url)).pathname);
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal instanceof AbortSignal);
    return Response.json({});
  };
  await getParks(); await getPark("a/b"); await getParkWeather("a/b"); await getParkWaterTemperature("a/b");
  const start = new Date("2026-01-01T00:00:00Z"), end = new Date("2026-01-02T00:00:00Z");
  await getParkWeatherObservations("a/b", start, end);
  await getParkWaterTemperatureHistory("a/b", start, end);
  assert.deepEqual(paths, ["/api/parks", "/api/parks/a%2Fb", "/api/parks/a%2Fb/weather", "/api/parks/a%2Fb/water-temperature", "/api/parks/a%2Fb/weather/observations", "/api/parks/a%2Fb/water-temperature/history"]);
});

test("history query encodes aware UTC bounds; response keeps nulls and sample times", async () => {
  const payload = { station_name: "Station", source: "fmi", source_station_id: 123, timezone: "Europe/Helsinki", observations: [{ timestamp: "2026-01-01T03:10:00+02:00", fetched_at: "2026-01-01T02:00:00Z", temperature: null }] };
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams;
    assert.equal(query.get("start_time"), "2025-12-31T22:00:00.000Z");
    assert.equal(query.get("end_time"), "2026-01-01T22:00:00.000Z");
    return Response.json(payload);
  };
  assert.deepEqual(await getParkWeatherObservations("park", new Date("2026-01-01T00:00:00+02:00"), new Date("2026-01-02T00:00:00+02:00")), payload);
});

test("invalid ranges do not send requests; exactly 31 elapsed days is accepted", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ observations: [] }); };
  const start = new Date("2026-01-01T00:00:00Z");
  for (const end of [start, new Date(+start - 1), new Date(NaN), new Date(+start + 31 * 86_400_000 + 1)]) {
    assert.throws(() => getParkWeatherObservations("park", start, end), RangeError);
  }
  assert.equal(calls, 0);
  assert.deepEqual(await getParkWaterTemperatureHistory("park", start, new Date(+start + 31 * 86_400_000)), { observations: [] });
});

test("HTTP failures retain status and FastAPI detail, never become empty data", async () => {
  for (const status of [404, 422, 503]) {
    globalThis.fetch = async () => Response.json({ detail: "test detail" }, { status });
    await assert.rejects(getParkWeather("park"), (error: unknown) => error instanceof ApiError && error.status === status && error.detail === "test detail");
  }
  globalThis.fetch = async () => new Response("gateway failure", { status: 502 });
  await assert.rejects(getParks(), (error: unknown) => error instanceof ApiError && error.status === 502 && error.detail === null);
});

test("configuration, network and malformed success failures propagate", async () => {
  delete process.env.WAKECAST_API_URL;
  await assert.rejects(getParks(), /not configured/);
  process.env.WAKECAST_API_URL = "http://localhost:8000";
  globalThis.fetch = async () => { throw new TypeError("network unavailable"); };
  await assert.rejects(getParks(), /network unavailable/);
  globalThis.fetch = async () => new Response("not JSON");
  await assert.rejects(getParks(), SyntaxError);
});
