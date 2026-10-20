import Link from "next/link";

import DailyForecast from "./DailyForecast";
import { translations, type Locale } from "@/lib/i18n";
import type { Park } from "@/types/park";
import styles from "./ParkDetails.module.css";

export default function ParkDetails({
  park,
  locale,
}: {
  park: Park;
  locale: Locale;
}) {
  const t = translations[locale].parkPage;
  const weatherSections = [
    ["current-conditions", t.current],
    ["daily-forecast", t.daily],
    ["detailed-weather", t.detailed],
  ];

  return (
    <article className={styles.page}>
      <header className={styles.heading}>
        <Link className={styles.back} href={`/${locale}`}>
          {t.back}
        </Link>
        <h1>{park.name}</h1>
        <p className={styles.location}>{park.city}</p>
        {!park.is_active && <p className="status-message">{t.inactive}</p>}
      </header>

      {/* Daily weather is connected; other weather sections remain placeholders. */}
      <div className={styles.weather}>
        {weatherSections.map(([id, title]) => (
          <section
            key={id}
            className={`${styles.placeholder} ${
              id === "daily-forecast" ? styles.dailyForecast : ""
            }`}
            aria-labelledby={id}
          >
            {id === "daily-forecast" ? (
              <DailyForecast
                slug={park.slug}
                locale={locale}
                timeZone={park.timezone}
              />
            ) : (
              <>
                <h2 id={id}>{title}</h2>
                <p>{t.comingSoon}</p>
              </>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}
