
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { translations, type Locale } from "@/lib/i18n";

interface LanguageSwitcherProps {
  locale: Locale;
}

export default function LanguageSwitcher({
  locale,
}: LanguageSwitcherProps) {
  const pathname = usePathname();

  const languages = [
    { code: "en", label: "English" },
    { code: "fi", label: "Suomi" },
  ] as const;

  return (
    <nav aria-label={translations[locale].languageSelection} className="language-switcher">
      {languages.map((language) => {
        const href = pathname.replace(
          /^\/(en|fi)(?=\/|$)/,
          `/${language.code}`
        );

        const isActive = locale === language.code;

        return (
          <Link
            key={language.code}
            href={href}
            hrefLang={language.code}
            lang={language.code}
            aria-current={isActive ? "page" : undefined}
            className={isActive ? "language-link is-active" : "language-link"}
          >
            {language.label}
          </Link>
        );
      })}
    </nav>
  );
}
