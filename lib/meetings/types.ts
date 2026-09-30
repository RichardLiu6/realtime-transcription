// Saved meetings: shapes shared by the autosave hook, the API routes and
// the meeting pages.

import type { BilingualEntry, TranslationMode } from "@/types/bilingual";

// Meeting ids: 128 random bits, base64url
export const MEETING_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

// One finalized sentence as saved
export interface SavedEntry {
  id: string;
  speaker: string;
  language: string;
  originalText: string;
  translatedText?: string; // two-way / one-way
  translations?: Record<string, string>; // multilingual: one per column
  translationProvisional?: boolean;
  startMs: number;
  endMs: number;
  at: number; // wall-clock time (ms)
}

export interface SavedSpeaker {
  id: string;
  label: string; // given name, or the engine default ("Speaker 1"); localized at display
  color: string;
}

export interface MeetingSettings {
  translationMode: TranslationMode;
  languageA: string[];
  languageB: string;
  targetLangs: string[];
}

export interface MeetingRecording {
  idx: number;
  contentType: string;
  sizeBytes: number;
  offsetMs: number; // transcript time where this recording starts
  durationMs: number;
}

export interface MeetingSummary {
  id: string;
  title: string;
  ownerEmail: string;
  createdAt: string;
  durationMs: number;
  entryCount: number;
  recordingCount: number;
  shared: boolean; // shared with the current user (not theirs)
}

export interface MeetingDetail extends MeetingSummary {
  expiresAt: string;
  settings: Partial<MeetingSettings>;
  speakers: SavedSpeaker[];
  summary: string | null;
  entries: SavedEntry[];
  recordings: MeetingRecording[];
  shares: string[]; // owner only; [] for others
  isOwner: boolean;
}

export function toSavedEntry(e: BilingualEntry): SavedEntry {
  return {
    id: e.id,
    speaker: e.speaker,
    language: e.language,
    originalText: e.originalText,
    ...(e.translatedText ? { translatedText: e.translatedText } : {}),
    ...(e.translations ? { translations: e.translations } : {}),
    ...(e.translationProvisional ? { translationProvisional: true } : {}),
    startMs: e.startMs,
    endMs: e.endMs,
    at: e.timestamp instanceof Date ? e.timestamp.getTime() : Date.now(),
  };
}

export function fromSavedEntry(e: SavedEntry): BilingualEntry {
  return {
    id: e.id,
    speaker: e.speaker,
    speakerLabel: "",
    language: e.language,
    originalText: e.originalText,
    translatedText: e.translatedText ?? "",
    translations: e.translations,
    translationProvisional: e.translationProvisional,
    isFinal: true,
    startMs: e.startMs,
    endMs: e.endMs,
    timestamp: new Date(e.at),
  };
}
