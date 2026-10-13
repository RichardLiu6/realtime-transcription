// Language search: a query matches a language by its code, its own name, or
// its name in any interface language (English, Chinese, Spanish,
// Vietnamese) — "西班牙", "spanish", "espanol", "tieng viet" and "vi" all
// find what they mean, whatever the interface language. Case and accents
// are ignored (đ counts as d).

import { SONIOX_LANGUAGES } from "@/types/bilingual";

const NAME_LOCALES = ["en", "zh", "es", "vi"];

export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
}

let index: Map<string, string> | null = null;

// code → every name it goes by, normalized (built once)
function searchIndex(): Map<string, string> {
  if (index) return index;
  const displayNames = NAME_LOCALES.flatMap((locale) => {
    try {
      return [new Intl.DisplayNames([locale], { type: "language" })];
    } catch {
      return [];
    }
  });
  index = new Map(
    SONIOX_LANGUAGES.map((l) => {
      const names = [l.code, l.name];
      for (const d of displayNames) {
        try {
          const n = d.of(l.code);
          if (n) names.push(n);
        } catch {
          // unknown to this browser: skip
        }
      }
      return [l.code, normalizeSearch(names.join(" | "))];
    })
  );
  return index;
}

export function languageMatches(code: string, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  return (searchIndex().get(code) ?? normalizeSearch(code)).includes(q);
}
