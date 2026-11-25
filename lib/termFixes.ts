// 现场修正: corrections for words the speech engine keeps mishearing
// ("鱼游" → "鱼油"), applied to every finished sentence before it is
// translated (the engine's context can't change mid-session). Remembered
// per device (localStorage `termFixes`). Latin words match whole and
// ignoring case; other scripts as written.

export interface TermFix {
  from: string;
  to: string;
  // "translation": a wrong rendering in the translations ("soft capsule" →
  // "softgel"), applied to every translation column as it lands; else the
  // transcript (a misheard word), before it is translated
  scope?: "translation";
}

export const MAX_FIX_CHARS = 60;
export const MAX_FIXES = 50;

export const isTermFixList = (v: unknown): v is TermFix[] =>
  Array.isArray(v) &&
  v.every(
    (f) =>
      f &&
      typeof f === "object" &&
      typeof f.from === "string" &&
      typeof f.to === "string" &&
      f.from &&
      (f.scope === undefined || f.scope === "translation")
  );

export const originalFixes = (fixes: TermFix[]) => fixes.filter((f) => f.scope !== "translation");
export const translationFixes = (fixes: TermFix[]) => fixes.filter((f) => f.scope === "translation");

// A sentence's translations with the translation fixes applied (single
// target `translatedText`, multilingual `translations`)
export function fixTranslations<T extends { translatedText?: string; translations?: Record<string, string> }>(
  value: T,
  fixes: TermFix[]
): T {
  if (fixes.length === 0) return value;
  return {
    ...value,
    ...(value.translatedText ? { translatedText: applyFixes(value.translatedText, fixes) } : {}),
    ...(value.translations
      ? { translations: Object.fromEntries(Object.entries(value.translations).map(([l, x]) => [l, applyFixes(x, fixes)])) }
      : {}),
  };
}

// A term or correction side as typed: trimmed, ≤ 60 characters, without the
// separators terms use ("=" between languages, commas between terms)
export function cleanTermPart(value: string): string | null {
  const v = value.replace(/\s+/g, " ").trim();
  if (!v || v.length > MAX_FIX_CHARS || /[=,，]/.test(v)) return null;
  return v;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LATIN = /^[\p{Script=Latin}\d\s.'’&-]+$/u;

function pattern(word: string): RegExp {
  return LATIN.test(word)
    ? new RegExp(`(?<![\\p{L}\\d])${escape(word)}(?![\\p{L}\\d])`, "giu")
    : new RegExp(escape(word), "gu");
}

export function applyFixes(text: string, fixes: TermFix[]): string {
  let out = text;
  for (const fix of fixes) if (fix.from) out = out.replace(pattern(fix.from), fix.to);
  return out;
}

// Whether a sentence holds any form of a term ("软胶囊=softgel": either side)
export function containsTerm(text: string, term: string): boolean {
  return term
    .split("=")
    .map((f) => f.trim())
    .filter(Boolean)
    .some((form) => pattern(form).test(text));
}
