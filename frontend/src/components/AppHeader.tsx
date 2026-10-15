import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { translations, type Locale } from "@/lib/i18n";

export default function AppHeader({ locale }: { locale: Locale }) {
  const t = translations[locale];
  return (
    <>
      <a className="skip-link" href="#main-content">{t.skipToContent}</a>
      <header className="site-header">
        <div className="content-width header-content">
          <Link className="brand" href={`/${locale}`} aria-label={t.homeLabel}>
            <span className="brand-mark" aria-hidden="true">≈</span>
            WakeCast
          </Link>
          <LanguageSwitcher locale={locale} />
        </div>
      </header>
    </>
  );
}
