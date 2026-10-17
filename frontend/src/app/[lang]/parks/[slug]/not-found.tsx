import Link from "next/link";
import { lang } from "next/root-params";

import { defaultLocale, isLocale, translations } from "@/lib/i18n";

// Not-found components receive no props; read the root locale on the server.
export default async function ParkNotFound() {
  const segment = await lang();
  const locale = isLocale(segment) ? segment : defaultLocale;
  const t = translations[locale].parkPage;

  return (
    <section aria-labelledby="park-not-found-title">
      <h1 id="park-not-found-title">{t.notFoundTitle}</h1>
      <p className="mt-4">{t.notFound}</p>
      <Link
        className="mt-4 inline-flex min-h-11 items-center underline"
        href={`/${locale}`}
      >
        {t.back}
      </Link>
    </section>
  );
}
