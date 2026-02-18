// Soniox supported languages for translation
export const SONIOX_LANGUAGES: { code: string; name: string }[] = [
  { code: "zh", name: "中文" },
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "ru", name: "Русский" },
  { code: "it", name: "Italiano" },
  { code: "ar", name: "العربية" },
  { code: "hi", name: "हिन्दी" },
  { code: "th", name: "ไทย" },
  { code: "vi", name: "Tiếng Việt" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "Polski" },
  { code: "tr", name: "Türkçe" },
  { code: "sv", name: "Svenska" },
  { code: "da", name: "Dansk" },
  { code: "no", name: "Norsk" },
  { code: "fi", name: "Suomi" },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "ms", name: "Bahasa Melayu" },
  { code: "uk", name: "Українська" },
  { code: "cs", name: "Čeština" },
  { code: "ro", name: "Română" },
  { code: "hu", name: "Magyar" },
  { code: "el", name: "Ελληνικά" },
  { code: "he", name: "עברית" },
  { code: "hr", name: "Hrvatski" },
  { code: "sk", name: "Slovenčina" },
  { code: "sl", name: "Slovenščina" },
  { code: "sr", name: "Srpski" },
  { code: "et", name: "Eesti" },
  { code: "lv", name: "Latviešu" },
  { code: "lt", name: "Lietuvių" },
  { code: "tl", name: "Tagalog" },
  { code: "sw", name: "Kiswahili" },
  { code: "cy", name: "Cymraeg" },
  { code: "gl", name: "Galego" },
  { code: "mk", name: "Македонски" },
  { code: "fa", name: "فارسی" },
  { code: "ta", name: "தமிழ்" },
  { code: "te", name: "తెలుగు" },
  { code: "kn", name: "ಕನ್ನಡ" },
  { code: "ml", name: "മലയാളം" },
  { code: "mr", name: "मराठी" },
  { code: "gu", name: "ગુજરાતી" },
  { code: "pa", name: "ਪੰਜਾਬੀ" },
  { code: "ur", name: "اردو" },
  { code: "kk", name: "Қазақ" },
];

export interface BilingualEntry {
  id: string;
  speaker: string; // Soniox speaker ID ("1", "2", ...)
  speakerLabel: string;
  language: string; // Language code of original text
  originalText: string;
  translatedText: string;
  interimOriginal?: string;
  interimTranslated?: string;
  isFinal: boolean;
  startMs: number;
  endMs: number;
  timestamp: Date;
}

export interface SpeakerInfo {
  id: string;
  label: string;
  color: string;
  wordCount: number;
}

export interface SonioxToken {
  text: string;
  is_final: boolean;
  speaker: string;
  start_ms: number;
  end_ms: number;
  translation_status: "none" | "original" | "translation";
  language: string;
  source_language?: string;
}

export type TranslationMode = "two_way" | "one_way";

export interface SonioxConfig {
  languageA: string[]; // e.g. ["*"] or ["zh", "en"]
  languageB: string; // e.g. "en"
  contextTerms: string[];
  translationMode: TranslationMode;
}
