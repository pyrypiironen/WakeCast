
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
    parkPage: {
      back: "Back to wakeparks",
      information: "Park information",
      waterType: "Water",
      sea: "Sea",
      lake: "Lake",
      timezone: "Local timezone",
      website: "Visit park website",
      booking: "Cables and booking",
      cable: "Cable",
      book: "Book",
      noCables: "No cable information is available for this park.",
      inactive: "This park is marked inactive. Check the park website for current availability.",
      current: "Current conditions",
      daily: "Daily forecast",
      weekly: "Weekly forecast",
      detailed: "Detailed weather data",
      comingSoon: "This view is not available yet.",
      unavailableTitle: "Park information unavailable",
      unavailable: "We could not load this park right now. Please try again.",
      retry: "Try again",
      notFoundTitle: "Park not found",
      notFound: "We could not find a wakepark at this address.",
    },
  },
  fi: {
    availableParks: "Wakeparkkeja",
    languageSelection: "Kielen valinta",
    skipToContent: "Siirry sisältöön",
    homeLabel: "WakeCast – etusivu",
    description: "Wakeboarding-sää ja ennusteet",
    parksUnavailable: "Wakeparkkeja ei voida juuri nyt hakea. Yritä myöhemmin uudelleen.",
    noParks: "Ei saatavilla olevia wakeparkkeja.",
    parkPage: {
      back: "Takaisin wakeparkkeihin",
      information: "Puiston tiedot",
      waterType: "Vesistö",
      sea: "Meri",
      lake: "Järvi",
      timezone: "Paikallinen aikavyöhyke",
      website: "Siirry puiston verkkosivuille",
      booking: "Kaapelit ja varaukset",
      cable: "Kaapeli",
      book: "Varaa",
      noCables: "Tämän puiston kaapelitietoja ei ole saatavilla.",
      inactive: "Puisto on merkitty epäaktiiviseksi. Tarkista ajantasainen saatavuus puiston verkkosivuilta.",
      current: "Nykyiset olosuhteet",
      daily: "Päiväennuste",
      weekly: "Viikkoennuste",
      detailed: "Tarkat säätiedot",
      comingSoon: "Tämä näkymä ei ole vielä käytettävissä.",
      unavailableTitle: "Puiston tiedot eivät ole saatavilla",
      unavailable: "Puiston tietoja ei voitu juuri nyt ladata. Yritä uudelleen.",
      retry: "Yritä uudelleen",
      notFoundTitle: "Puistoa ei löytynyt",
      notFound: "Tästä osoitteesta ei löytynyt wakeparkkia.",
    },
  },
};
