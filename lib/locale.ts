// Shared by server (app/layout.tsx) and client (lib/i18n.ts) — no "use client".
export type Locale = "en" | "zh";

// Match zh-CN, zh-TW, zh-HK, zh etc.
export function localeFromLanguage(lang: string | null | undefined): Locale {
  return lang?.trim().toLowerCase().startsWith("zh") ? "zh" : "en";
}

// First entry of Accept-Language is the browser's primary language,
// i.e. the same value as navigator.language on the client.
export function localeFromAcceptLanguage(header: string | null): Locale {
  return localeFromLanguage(header?.split(",")[0]?.split(";")[0]);
}
