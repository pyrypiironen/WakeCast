
export const locales = ["en", "fi"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}

export const translations = {
  en: {
    availableParks: "Available wakeparks",
  },
  fi: {
    availableParks: "Wakeparkkeja",
  },
};
