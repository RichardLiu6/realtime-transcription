import type { BilingualEntry, TranslationMode } from "@/types/bilingual";

// Which text of a sentence to show in a given language — shared by the
// presentation (projector) mode and the multilingual table, so both follow
// the same rules as the translation requests in useSonioxTranscription.

// Two-way mode takes a single language A; "any" means Chinese there
export function primaryLanguageA(languageA: string[]): string {
  return languageA[0] === "*" ? "zh" : (languageA[0] ?? "zh");
}

// Target language of a single-target translation (two_way / one_way): text in
// language B goes to language A, everything else to language B
export function singleTargetLanguage(
  mode: TranslationMode,
  sourceLang: string,
  languageA: string[],
  languageB: string
): string {
  if (mode === "two_way" && sourceLang === languageB) return primaryLanguageA(languageA);
  return languageB;
}

// The meeting's languages, in display order (language A first). One-way
// with "any language" as the source has no fixed list, so it uses the
// languages actually heard.
export function meetingLanguages(
  mode: TranslationMode,
  languageA: string[],
  languageB: string,
  targetLangs: string[],
  entries: BilingualEntry[] = []
): string[] {
  let langs: string[];
  if (mode === "presentation") langs = targetLangs;
  else if (mode === "two_way") langs = [primaryLanguageA(languageA), languageB];
  else {
    const sources = languageA.filter((l) => l !== "*");
    const heard = languageA.includes("*") ? entries.map((e) => e.language).filter(Boolean) : [];
    langs = [...sources, ...heard, languageB];
  }
  return Array.from(new Set(langs));
}

// Same text once punctuation, spacing and case are ignored — a same-language
// column that just repeats the original
export function sameText(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
  const na = norm(a);
  return na.length > 0 && na === norm(b);
}

export interface SentenceText {
  // Confirmed text
  text: string;
  // Live, not yet confirmed tail of the original (shown lighter)
  interim: string;
  // A translation of partial speech that is still being revised
  provisional: boolean;
  // The words as spoken (not a translation)
  isOriginal: boolean;
}

// A sentence in one language: the original when it was spoken in that
// language, else its translation. Multilingual mode has a translation for
// every column (the spoken language's is a cleaned-up version); two-way /
// one-way have one translation, so a sentence whose target is some other
// language stays in its original. Null when there is nothing to show yet.
export function sentenceIn(
  entry: BilingualEntry,
  lang: string,
  mode: TranslationMode,
  languageA: string[],
  languageB: string
): SentenceText | null {
  const original = (): SentenceText | null =>
    entry.originalText || entry.interimOriginal
      ? {
          text: entry.originalText,
          interim: entry.isFinal ? "" : (entry.interimOriginal ?? ""),
          provisional: false,
          isOriginal: true,
        }
      : null;
  const translation = (text: string | undefined): SentenceText | null =>
    text ? { text, interim: "", provisional: !!entry.translationProvisional, isOriginal: false } : null;

  if (mode === "presentation") {
    const text = entry.translations?.[lang];
    if (text) return translation(text);
    // Still translating: its own language can show the original meanwhile
    return entry.language === lang ? original() : null;
  }
  if (entry.language === lang) return original();
  if (singleTargetLanguage(mode, entry.language, languageA, languageB) === lang) {
    return translation(entry.translatedText);
  }
  return original();
}
