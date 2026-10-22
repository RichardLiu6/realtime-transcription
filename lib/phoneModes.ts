// The phone layout's three modes over the four translation modes:
// 互译 (two_way with 2 languages, presentation with 3+ — adding or removing
// a language switches between them), 单向翻译 (one_way) and 纯转录
// (transcribe). The stored settings stay the four modes; this file only maps.

import type { TranslationMode } from "@/types/bilingual";
import { primaryLanguageA } from "@/lib/meetingLanguages";

export type PhoneMode = "mutual" | "oneway" | "transcribe";

export function phoneModeOf(mode: TranslationMode): PhoneMode {
  if (mode === "one_way") return "oneway";
  if (mode === "transcribe") return "transcribe";
  return "mutual";
}

// The 互译 languages: A ⇄ B, or the multilingual columns
export function mutualLanguages(
  mode: TranslationMode,
  languageA: string[],
  languageB: string,
  targetLangs: string[]
): string[] {
  if (mode === "presentation") return targetLangs;
  const a = primaryLanguageA(languageA);
  return a === languageB ? [a] : [a, languageB];
}

export interface MeetingSettingsSetters {
  setMode: (mode: TranslationMode) => void;
  setLanguageA: (codes: string[]) => void;
  setLanguageB: (code: string) => void;
  setTargetLangs: (codes: string[]) => void;
}

// 互译 with these languages: two → face-to-face (two_way), more → group
// meeting (presentation, every column)
export function applyMutual(
  languages: string[],
  current: TranslationMode,
  set: MeetingSettingsSetters
) {
  if (languages.length < 2) return;
  if (languages.length === 2) {
    if (current !== "two_way") set.setMode("two_way");
    set.setLanguageA([languages[0]]);
    set.setLanguageB(languages[1]);
    return;
  }
  if (current !== "presentation") {
    set.setMode("presentation");
    // Spoken languages: detected (the columns are hints anyway)
    if (current === "two_way") set.setLanguageA(["*"]);
  }
  set.setTargetLangs(languages);
}

// Switching modes keeps what still makes sense: 互译 starts from the target
// and one other language, 单向翻译 translates everything into `homeLanguage`
// (the interface language), 纯转录 detects the spoken language
export function applyPhoneMode(
  next: PhoneMode,
  current: TranslationMode,
  languageA: string[],
  languageB: string,
  homeLanguage: string,
  set: MeetingSettingsSetters
) {
  if (phoneModeOf(current) === next) return;
  if (next === "mutual") {
    const spoken = languageA.find((c) => c !== "*" && c !== languageB);
    const other = spoken ?? (languageB === "en" ? "zh" : "en");
    applyMutual([other, languageB], current, set);
  } else if (next === "oneway") {
    set.setMode("one_way");
    set.setLanguageA(["*"]);
    set.setLanguageB(homeLanguage);
  } else {
    set.setMode("transcribe");
    set.setLanguageA(["*"]);
  }
}

// The languages a meeting is in: 互译's languages, the sources and target of
// 单向翻译, the spoken languages of 纯转录 (`home` when none is chosen).
// The default for AI-suggested terms.
export function meetingLanguagesOf(
  mode: TranslationMode,
  languageA: string[],
  languageB: string,
  targetLangs: string[],
  home: string
): string[] {
  const phone = phoneModeOf(mode);
  if (phone === "mutual") return mutualLanguages(mode, languageA, languageB, targetLangs);
  const sources = languageA.filter((c) => c !== "*");
  if (phone === "oneway") return Array.from(new Set([...sources, languageB]));
  return sources.length > 0 ? sources : [home];
}
