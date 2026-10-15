
import { notFound } from "next/navigation";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import { getParks } from "@/lib/api";
import { isLocale, translations } from "@/lib/i18n";

export default async function Home({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  if (!isLocale(lang)) {
    notFound();
  }

  const t = translations[lang];
  const parks = await getParks();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <LanguageSwitcher locale={lang} />

      <h1 className="mt-6 text-3xl font-bold">
        WakeCast
      </h1>

      <p className="mt-4">
        {t.availableParks}: {parks.length}
      </p>

      <ul className="mt-4 space-y-2">
        {parks.map((park) => (
          <li key={park.id}>
            {park.name} — {park.city}
          </li>
        ))}
      </ul>
    </main>
  );
}
