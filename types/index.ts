export interface TranslationSet {
  zh: string;
  en: string;
  es: string;
}

export interface TranscriptEntry {
  id: string;
  text: string;
  interimText?: string;
  language: string;
  translations: TranslationSet;
  timestamp: Date;
  speaker?: string;
}
