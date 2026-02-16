export interface BilingualEntry {
  id: string;
  speaker: number; // Soniox speaker ID (0, 1, 2, ...)
  speakerLabel: string; // Display name: "Speaker 1", "Speaker 2", ...
  language: "zh" | "en"; // Detected language of original text
  originalText: string; // Final original text
  translatedText: string; // Final translated text
  interimOriginal?: string; // In-progress original text
  interimTranslated?: string; // In-progress translated text
  isFinal: boolean;
  startMs: number;
  endMs: number;
  timestamp: Date;
}

export interface SpeakerInfo {
  id: number; // Soniox speaker ID
  label: string; // Display name
  color: string; // Tailwind color class
  wordCount: number;
}

export interface SonioxToken {
  text: string;
  is_final: boolean;
  speaker: number;
  start_ms: number;
  end_ms: number;
}

export interface SonioxConfig {
  language: "zh" | "en";
  contextTerms: string[];
}
