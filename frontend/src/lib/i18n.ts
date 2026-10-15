
export const locales = ["en", "fi"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}

export const translations = {
  en: {
    availableParks: "Available wakeparks",
    languageSelection: "Language selection",
    skipToContent: "Skip to content",
    homeLabel: "WakeCast home",
    description: "Wakeboarding weather conditions and forecasts",
    parksUnavailable: "Wakeparks are currently unavailable. Please try again later.",
    noParks: "No wakeparks available.",
  },
  fi: {
    availableParks: "Wakeparkkeja",
    languageSelection: "Kielen valinta",
    skipToContent: "Siirry sisältöön",
    homeLabel: "WakeCast – etusivu",
    description: "Wakeboarding-sää ja ennusteet",
    parksUnavailable: "Wakeparkkeja ei voida juuri nyt hakea. Yritä myöhemmin uudelleen.",
    noParks: "Ei saatavilla olevia wakeparkkeja.",
  },
};
