"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { refreshDailyWeather } from "@/app/actions/refresh-daily-weather";

import { addCalendarDays, localDayRange } from "@/lib/date";
import { translations, type Locale } from "@/lib/i18n";
import DailyWeatherChart from "./DailyWeatherChart";
import CurrentConditions from "./CurrentConditions";
import parkStyles from "./ParkDetails.module.css";
import type { DailyWeatherData } from "@/lib/daily-weather";
import styles from "./DailyForecast.module.css";
import { defaultChartWindow, type ChartWindow } from "@/lib/chart-window";

interface DailyForecastViewProps {
  slug: string;
  locale: Locale;
  timeZone: string;
  data: DailyWeatherData;
  includeCurrentConditions?: boolean;
}

const REFRESH_INTERVAL_MS = 60_000;

export default function DailyForecastView({
  slug,
  locale,
  timeZone,
  data,
  includeCurrentConditions = false,
}: DailyForecastViewProps) {

const [liveData, setLiveData] = useState(data);

  const fullscreenRef = useRef<HTMLDivElement>(null);
  const savedScrollPosition = useRef({ x: 0, y: 0 });
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasFullscreenRef = useRef(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenFailed, setFullscreenFailed] = useState(false);

    async function openFullscreen() {
        const element = fullscreenRef.current;
        if (!element) return;

        savedScrollPosition.current = {
          x: window.scrollX,
          y: window.scrollY,
        };

        setFullscreenFailed(false);

    if (element.requestFullscreen) {
      try {
        await element.requestFullscreen();
        return;
      } catch {
        // Use the overlay when native fullscreen is rejected.
      }
    }

    setIsFullscreen(true);
  }

    async function closeFullscreen() {
    if (
      fullscreenRef.current &&
      document.fullscreenElement === fullscreenRef.current
    ) {
      try {
        await document.exitFullscreen();
      } catch {
        setFullscreenFailed(true);
      }

      return;
    }

    setIsFullscreen(false);
    setFullscreenFailed(false);

  }

  useEffect(() => {
  function handleFullscreenChange() {
    const element = fullscreenRef.current;

    setIsFullscreen(
      element !== null && document.fullscreenElement === element,
    );
    setFullscreenFailed(false);
  }

  document.addEventListener("fullscreenchange", handleFullscreenChange);

  return () => {
    document.removeEventListener(
      "fullscreenchange",
      handleFullscreenChange,
    );
  };
}, []);

  useEffect(() => {
  if (isFullscreen) {
    closeButtonRef.current?.focus({ preventScroll: true });
  } else if (wasFullscreenRef.current) {
    expandButtonRef.current?.focus({ preventScroll: true });
  }

  wasFullscreenRef.current = isFullscreen;
}, [isFullscreen]);

    useEffect(() => {
    if (!isFullscreen) return;

    const body = document.body;
    const { x: scrollX, y: scrollY } = savedScrollPosition.current;

    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (
        event.key === "Escape" &&
        document.fullscreenElement !== fullscreenRef.current
      ) {
        event.preventDefault();
        setIsFullscreen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);

      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;

      window.scrollTo({
        left: scrollX,
        top: scrollY,
        behavior: "instant",
      });
    };
    }, [isFullscreen]);

useEffect(() => {
  const container = fullscreenRef.current;
  if (!isFullscreen || !container) return;

  // Disable background branches without disabling the chart's ancestors.
  const background: Array<{
    element: Element;
    previousInert: string | null;
  }> = [];

  let branch: Element = container;

  while (branch.parentElement) {
    const parent = branch.parentElement;

    for (const sibling of Array.from(parent.children)) {
      if (sibling === branch) continue;

      background.push({
        element: sibling,
        previousInert: sibling.getAttribute("inert"),
      });

      sibling.setAttribute("inert", "");
    }

    if (parent === document.body) break;
    branch = parent;
  }

  function getFocusableElements() {
    return Array.from(
      container!.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex]',
      ),
    ).filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        !element.closest("[inert]") &&
        element.getClientRects().length > 0 &&
        window.getComputedStyle(element).visibility === "visible",
    );
  }

  function handleTab(event: KeyboardEvent) {
    if (event.key !== "Tab") return;

    const elements = getFocusableElements();
    const first = elements[0];
    const last = elements[elements.length - 1];

    if (!first || !last) {
      event.preventDefault();
      container!.focus({ preventScroll: true });
      return;
    }

    const active = document.activeElement;
    const isInside = active !== null && container!.contains(active);

    if (event.shiftKey && (active === first || active === container || !isInside)) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !isInside)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  function handleFocus(event: FocusEvent) {
    if (
      event.target instanceof Node &&
      !container!.contains(event.target)
    ) {
      (closeButtonRef.current ?? container!).focus({
        preventScroll: true,
      });
    }
  }

  document.addEventListener("keydown", handleTab);
  document.addEventListener("focusin", handleFocus);

  return () => {
    document.removeEventListener("keydown", handleTab);
    document.removeEventListener("focusin", handleFocus);

    for (const { element, previousInert } of background) {
      if (previousInert === null) {
        element.removeAttribute("inert");
      } else {
        element.setAttribute("inert", previousInert);
      }
    }
  };
}, [isFullscreen]);

const [nowMs, setNowMs] = useState(() => Date.parse(data.requestedAt));
const [refreshing, setRefreshing] = useState(false);
const [refreshFailed, setRefreshFailed] = useState(false);

const refreshInFlight = useRef(false);
const lastRefreshAttempt = useRef(Date.parse(data.requestedAt));

const refresh = useCallback(async () => {
  if (refreshInFlight.current) return;

  refreshInFlight.current = true;
  lastRefreshAttempt.current = Date.now();
  setRefreshing(true);

  try {
    const next = await refreshDailyWeather(slug, timeZone);

    // Preserve previously loaded data when an API source fails.
    setLiveData((previous) => ({
      ...next,
      forecasts:
        next.forecasts.status === "ok"
          ? next.forecasts
          : previous.forecasts,
      observations:
        next.observations.status === "ok"
          ? next.observations
          : previous.observations,
      water:
        next.water.status === "ok"
          ? next.water
          : previous.water,
    }));

    setRefreshFailed(
      next.forecasts.status !== "ok" ||
      next.observations.status === "error" ||
      next.water.status === "error" ||
      (next.observations.status === "unavailable" &&
        next.observations.httpStatus === 503) ||
      (next.water.status === "unavailable" &&
        next.water.httpStatus === 503),
    );
  } catch {
    setRefreshFailed(true);
  } finally {
    refreshInFlight.current = false;
    setRefreshing(false);
    setNowMs(Date.now());
  }
}, [slug, timeZone]);

  useEffect(() => {
    function tick() {
      if (document.visibilityState !== "visible") return;

      const now = Date.now();
      setNowMs(now);

      if (
        now - lastRefreshAttempt.current >= REFRESH_INTERVAL_MS
      ) {
        void refresh();
      }
    }

    function handleReturn() {
      if (document.visibilityState !== "visible") return;

      const now = Date.now();
      setNowMs(now);

      // Avoid duplicate requests from simultaneous focus/visibility events.
      if (now - lastRefreshAttempt.current >= 5_000) {
        void refresh();
      }
    }

    tick();

    const timer = window.setInterval(tick, 1_000);

    document.addEventListener("visibilitychange", handleReturn);
    window.addEventListener("focus", handleReturn);
    window.addEventListener("online", handleReturn);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleReturn);
      window.removeEventListener("focus", handleReturn);
      window.removeEventListener("online", handleReturn);
    };
  }, [refresh]);
  const today = liveData.today;
  const [selectedDate, setSelectedDate] = useState(today);
  const [chartWindow, setChartWindow] = useState<ChartWindow>(() =>
    defaultChartWindow(data.requestedAt, timeZone),
  );

  const t = translations[locale].dailyForecast;
  const forecastUpdatedAt =
  liveData.forecasts.status === "ok"
    ? liveData.forecasts.data.fetched_at
    : null;

const timestampMs = forecastUpdatedAt
  ? Date.parse(forecastUpdatedAt)
  : NaN;

const minutesOld = Number.isFinite(timestampMs)
  ? Math.max(0, Math.floor((nowMs - timestampMs) / 60_000))
  : null;

const freshnessLabel =
  minutesOld === null
    ? t.updateUnavailable
    : `${t.updated} ${minutesOld} ${t.minutesAgo}`;
  const parkText = translations[locale].parkPage;

  const { earliestDate, latestDate } = liveData;
  const isToday = selectedDate === today;
  const { start } = localDayRange(selectedDate, timeZone);

  const displayDate = new Intl.DateTimeFormat(
    locale === "fi" ? "fi-FI" : "en-GB",
    {
      timeZone,
      day: "numeric",
      month: "long",
    },
  ).format(start);

  function moveDay(offset: number) {
    setSelectedDate((current) => {
      const next = addCalendarDays(current, offset);

      return next >= earliestDate && next <= latestDate ? next : current;
    });
  }

  const chartView = (
      <div
        ref={fullscreenRef}
        role={isFullscreen ? "dialog" : undefined}
        aria-modal={isFullscreen ? true : undefined}
        aria-label={
          isFullscreen
            ? locale === "fi"
              ? "Sääkuvaaja koko näytöllä"
              : "Fullscreen weather chart"
            : undefined
        }
        tabIndex={isFullscreen ? -1 : undefined}
        className={`${styles.content} ${
          isFullscreen ? styles.fullscreenView : ""
        }`}
      >
        <header className={styles.header}>
                <div className={styles.headingGroup}>
          <h2 id="daily-forecast">{parkText.daily}</h2>

                    {isFullscreen ? (
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.expandButton}
              onClick={() => void closeFullscreen()}
              aria-label={
                locale === "fi" ? "Sulje koko näyttö" : "Exit fullscreen"
              }
              title={
                locale === "fi" ? "Sulje koko näyttö" : "Exit fullscreen"
              }
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          ) : (
            <button
              ref={expandButtonRef}
              type="button"
              className={styles.expandButton}
              onClick={() => void openFullscreen()}
              aria-label={
                locale === "fi"
                  ? "Avaa kuvaaja koko näytölle"
                  : "Open chart fullscreen"
              }
              title={
                locale === "fi"
                  ? "Avaa kuvaaja koko näytölle"
                  : "Open chart fullscreen"
              }
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5" />
              </svg>
            </button>
          )}
        </div>
        <div className={styles.refreshArea}>
  <div
  className={styles.refreshStatus}
  aria-busy={refreshing}
>
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 11a8 8 0 1 0-2.1 5.4" />
    <path d="M20 4v7h-7" />
  </svg>

  <time dateTime={forecastUpdatedAt ?? undefined}>
    {freshnessLabel}
  </time>
</div>

  {refreshFailed && (
    <span className={styles.refreshWarning} role="status">
      {t.refreshFailed}
    </span>
  )}
</div>
      </header>
      {fullscreenFailed && (
        <p role="status">
          {locale === "fi"
            ? "Koko näytön tilan vaihtaminen ei onnistunut."
            : "Could not change fullscreen mode."}
        </p>
      )}

      <div className={styles.navigation}>
        <button
          type="button"
          className={styles.dayButton}
          onClick={() => moveDay(-1)}
          disabled={selectedDate <= earliestDate}
          aria-label={t.previousDay}
          title={t.previousDay}
        >
          <span aria-hidden="true">←</span>
        </button>

        <button
          type="button"
          className={styles.dayButton}
          onClick={() => setSelectedDate(today)}
          disabled={isToday}
        >
          {t.today}
        </button>

        <button
          type="button"
          className={styles.dayButton}
          onClick={() => moveDay(1)}
          disabled={selectedDate >= latestDate}
          aria-label={t.nextDay}
          title={t.nextDay}
        >
          <span aria-hidden="true">→</span>
        </button>

        {/* Date in navigation row */}
        <p className={styles.date} aria-live="polite" aria-atomic="true">
          {isToday && `${t.today} — `}
          <time dateTime={selectedDate}>{displayDate}</time>
        </p>

        {/* PARTIAL CHANGE — Chart display selector */}
        <div
          className={styles.chartWindowSwitch}
          role="group"
          aria-label={
            locale === "fi" ? "Kuvaajan aikaväli" : "Chart time range"
          }
        >
          <button
            type="button"
            className={styles.windowButton}
            aria-pressed={chartWindow === "12h"}
            onClick={() => setChartWindow("12h")}
          >
            09–21
          </button>

          <button
            type="button"
            className={styles.windowButton}
            aria-pressed={chartWindow === "24h"}
            onClick={() => setChartWindow("24h")}
          >
            24h
          </button>
        </div>
      </div>

      <DailyWeatherChart
        data={liveData}
        selectedDate={selectedDate}
        timeZone={timeZone}
        locale={locale}
        chartWindow={chartWindow}
        fullscreen={isFullscreen}
      />
    </div>
  );

  if (!includeCurrentConditions) return chartView;

  return (
    <>
      <section
        className={`${parkStyles.placeholder} ${parkStyles.dailyForecast}`}
        aria-labelledby="current-conditions"
      >
        <CurrentConditions
          data={liveData}
          nowMs={nowMs}
          locale={locale}
          timeZone={timeZone}
          refreshFailed={refreshFailed}
        />
      </section>
      <section
        className={`${parkStyles.placeholder} ${parkStyles.dailyForecast}`}
        aria-labelledby="daily-forecast"
      >
        {chartView}
      </section>
    </>
  );
}
