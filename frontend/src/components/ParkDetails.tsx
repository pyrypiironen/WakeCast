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

  return (
    <article className={styles.page}>
      <header className={styles.heading}>
        <h1>{park.name}</h1>
        <p className={styles.location}>{park.city}</p>
        {!park.is_active && <p className="status-message">{t.inactive}</p>}
      </header>

      <div className={styles.weather}>
        <DailyForecast
          slug={park.slug}
          locale={locale}
          timeZone={park.timezone}
          includeCurrentConditions
        />
      </div>
    </article>
  );
}
