export interface TranslationSet {
  zh: string;
  en: string;
  es: string;
}

export interface Paragraph {
  id: string;
  text: string;           // accumulated final transcription text
  interimText: string;    // current interim text (live typing effect)
  speaker: number;        // speaker index from Deepgram diarization (0, 1, 2...)
  language: string;       // detected language code
  startTime: Date;
  translations: TranslationSet;
  isTranslating: boolean; // translation in progress
}

// Keep backward compat alias for summarize/export
export type TranscriptEntry = Paragraph;
