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
  const website =
    locale === "fi"
      ? (park.website_url_fi ?? park.website_url)
      : park.website_url;
  const weatherSections = [
    ["current-conditions", t.current],
    ["daily-forecast", t.daily],
    ["weekly-forecast", t.weekly],
    ["detailed-weather", t.detailed],
  ];

  return (
    <article className={styles.page}>
      <header className={styles.heading}>
        <Link className={styles.back} href={`/${locale}`}>
          {t.back}
        </Link>
        <h1>{park.name}</h1>
        <p className={styles.location}>
          {park.city}, {park.country}
        </p>
        {!park.is_active && <p className="status-message">{t.inactive}</p>}
      </header>

      <section className={styles.panel} aria-labelledby="park-information">
        <h2 id="park-information">{t.information}</h2>
        <dl className={styles.facts}>
          <div>
            <dt>{t.waterType}</dt>
            <dd>{t[park.water_type]}</dd>
          </div>
          <div>
            <dt>{t.timezone}</dt>
            <dd>{park.timezone}</dd>
          </div>
        </dl>
        <a className={styles.action} href={website}>
          {t.website}
        </a>
      </section>

      <section className={styles.panel} aria-labelledby="park-booking">
        <h2 id="park-booking">{t.booking}</h2>
        {park.cables.length === 0 ? (
          <p>{t.noCables}</p>
        ) : (
          <ul className={styles.cables}>
            {park.cables.map((cable, index) => {
              const name = cable.name?.trim() || `${t.cable} ${index + 1}`;
              const href =
                locale === "fi"
                  ? (cable.booking_url_fi ?? cable.booking_url)
                  : cable.booking_url;
              return (
                <li key={`${cable.booking_url}-${index}`}>
                  <h3>{name}</h3>
                  <a className={styles.action} href={href}>
                    {t.book} — {name}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
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
