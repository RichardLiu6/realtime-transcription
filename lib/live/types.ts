// Live caption sharing: what the host publishes and viewers receive.
// Shared by the host hook, the API routes and the viewer page.

import type { BilingualEntry } from "@/types/bilingual";

// A transcript entry as shared: only what the multilingual view shows
export interface LiveEntry {
  id: string;
  speaker: string;
  language: string;
  originalText: string;
  interimOriginal?: string;
  translations?: Record<string, string>;
  translationProvisional?: boolean;
  isFinal: boolean;
  startMs: number;
  endMs: number;
  at: number; // entry timestamp (ms)
}

export interface LiveSpeaker {
  id: string;
  label: string; // given name, or the engine default ("Speaker 1"); localized by the viewer
  color: string;
}

// The room's current state besides the entries
export interface LiveInfo {
  targetLangs: string[]; // the host's multilingual columns: what a viewer may pick from
  languageA: string[];
  speakers: LiveSpeaker[];
  recording: boolean;
  at?: number; // set by the server: when the host last published it (heartbeat every 15 s)
}

// Poll response (GET /api/live/<room>?since=<version>)
export type LivePollResponse =
  | { snapshot: true; version: number; entries: LiveEntry[]; info: LiveInfo | null; now: number }
  | { snapshot: false; version: number; batches: { at: number; entries?: LiveEntry[]; info?: LiveInfo; reset?: boolean; ended?: boolean }[]; now: number };

// Room ids are the capability: 128 random bits, base64url
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function toLiveEntry(e: BilingualEntry): LiveEntry {
  return {
    id: e.id,
    speaker: e.speaker,
    language: e.language,
    originalText: e.originalText,
    ...(e.interimOriginal ? { interimOriginal: e.interimOriginal } : {}),
    ...(e.translations ? { translations: e.translations } : {}),
    ...(e.translationProvisional ? { translationProvisional: true } : {}),
    isFinal: e.isFinal,
    startMs: e.startMs,
    endMs: e.endMs,
    at: e.timestamp instanceof Date ? e.timestamp.getTime() : Date.now(),
  };
}

export function fromLiveEntry(e: LiveEntry): BilingualEntry {
  return {
    id: e.id,
    speaker: e.speaker,
    speakerLabel: "",
    language: e.language,
    originalText: e.originalText,
    translatedText: "",
    translations: e.translations,
    translationProvisional: e.translationProvisional,
    interimOriginal: e.interimOriginal,
    isFinal: e.isFinal,
    startMs: e.startMs,
    endMs: e.endMs,
    timestamp: new Date(e.at),
  };
}
