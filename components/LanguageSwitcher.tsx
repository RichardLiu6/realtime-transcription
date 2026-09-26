"use client";

import { useEffect } from "react";
import { Globe } from "lucide-react";
import { LOCALES, setLocale, useLocale, useT, type Locale } from "@/lib/i18n";

// Interface language picker (中文 / English / Español / Tiếng Việt); the
// choice is remembered in localStorage
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const t = useT();
  const locale = useLocale();
  // Screen readers and the browser's own translation prompt follow <html lang>
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <label className={`flex items-center gap-1 text-xs text-muted-foreground ${className}`}>
      <Globe className="size-3.5" aria-hidden />
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label={t("ui_language")}
        className="cursor-pointer bg-transparent text-xs text-muted-foreground outline-none hover:text-foreground"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
