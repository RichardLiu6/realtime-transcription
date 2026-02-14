export const ALL_LANGS = ["zh", "en", "es"] as const;
export type LangCode = (typeof ALL_LANGS)[number];

export const LANG_NAMES: Record<LangCode, string> = {
  zh: "Chinese",
  en: "English",
  es: "Spanish",
};

export const LANG_LABELS: Record<LangCode, string> = {
  zh: "中",
  en: "EN",
  es: "ES",
};

export const LANG_BADGES: Record<LangCode, string> = {
  zh: "bg-blue-100 text-blue-700",
  en: "bg-green-100 text-green-700",
  es: "bg-orange-100 text-orange-700",
};
