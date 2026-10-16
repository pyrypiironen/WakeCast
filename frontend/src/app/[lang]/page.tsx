
import { notFound } from "next/navigation";

import { getParks } from "@/lib/api";
import type { Park } from "@/types/park";
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
  let parks: Park[] | null = null;
  try {
    parks = await getParks();
  } catch {
    // Keep the shared navigation usable when the backend is unavailable.
  }

  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">{t.description}</h1>
      {parks === null ? (
        <p role="status" className="status-message">{t.parksUnavailable}</p>
      ) : (
        <>
          <p className="mt-4">{t.availableParks}: {parks.length}</p>
          {parks.length === 0 && <p className="status-message">{t.noParks}</p>}
          <ul className="mt-4 space-y-2">
            {parks.map((park) => (
              <li key={park.id}>{park.name} — {park.city}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
