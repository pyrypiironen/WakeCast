import Link from "next/link";
import { notFound } from "next/navigation";

import ParkDetails from "@/components/ParkDetails";
import { ApiError, getPark } from "@/lib/api";
import { isLocale, translations } from "@/lib/i18n";
import type { Park } from "@/types/park";

export default async function ParkPage({
  params,
}: PageProps<"/[lang]/parks/[slug]">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();

  const t = translations[lang].parkPage;
  let park: Park;
  try {
    park = await getPark(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();

    return (
      <section aria-labelledby="park-unavailable-title">
        <Link className="underline" href={`/${lang}`}>
          {t.back}
        </Link>
        <h1 id="park-unavailable-title" className="mt-6">
          {t.unavailableTitle}
        </h1>
        <p role="status" className="status-message">
          {t.unavailable}
        </p>
        {/* A full reload retries the server request, including on the same URL. */}
        <a
          className="mt-4 inline-flex min-h-11 items-center underline"
          href={`/${lang}/parks/${encodeURIComponent(slug)}`}
        >
          {t.retry}
        </a>
      </section>
    );
  }

  return <ParkDetails park={park} locale={lang} />;
}
