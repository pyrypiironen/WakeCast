import { loadDailyWeather } from "@/lib/daily-weather";
import type { Locale } from "@/lib/i18n";
import DailyForecastView from "./DailyForecastView";

interface DailyForecastProps {
  slug: string;
  locale: Locale;
  timeZone: string;
}

export default async function DailyForecast({
  slug,
  locale,
  timeZone,
}: DailyForecastProps) {
  const data = await loadDailyWeather(slug, timeZone);

  return (
    <DailyForecastView
      locale={locale}
      timeZone={timeZone}
      data={data}
    />
  );
}