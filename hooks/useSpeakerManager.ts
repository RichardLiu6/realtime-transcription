"use client";

import { useState, useCallback } from "react";
import type { SpeakerInfo } from "@/types/bilingual";
import type { TranslationKey } from "@/lib/i18n";
import { defaultSpeakerLabel } from "@/hooks/useSonioxTranscription";

// The one speaker palette (SpeakerInfo.color is used by the transcript rows,
// the speaker panel and its bars alike). Every color reads ≥ 4.5:1 on white
// as name text, and none is red: red means recording / error in this UI.
export const SPEAKER_COLORS = [
  "#1d4ed8", // blue-700
  "#047857", // emerald-700
  "#7e22ce", // purple-700
  "#b45309", // amber-700
  "#0e7490", // cyan-700
  "#a21caf", // fuchsia-700
  "#4d7c0f", // lime-700
  "#4338ca", // indigo-700
];

// For a row rendered before its speaker is registered (registration runs in
// an effect after the entry appears)
export const FALLBACK_SPEAKER_COLOR = "#52525b"; // zinc-600

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

// The name to show for a speaker. An unrenamed speaker still carries the
// engine's English default ("Speaker 1 (#2)"), which is shown in the
// interface language ("说话人 1 (#2)"); ids and given names never change.
export function speakerDisplayName(speakerId: string, label: string | undefined, t: Translate): string {
  if (label && label !== defaultSpeakerLabel(speakerId)) return label;
  const [recording, speaker] = speakerId.includes(":") ? speakerId.split(":") : ["1", speakerId];
  const manual = /^new(\d+)$/.exec(speaker ?? "");
  const base = manual ? t("speaker_new", { n: manual[1] }) : t("speaker_default", { n: speaker || "1" });
  return recording === "1" ? base : `${base} (#${recording})`;
}

// A speaker id for one sentence moved to "a new speaker" (the engine put two
// people under one): "<recording>:new<k>", numbered past the ones already
// there, so it never meets an engine speaker number
export function newSpeakerId(forSpeaker: string, existing: Iterable<string>): string {
  const recording = forSpeaker.includes(":") ? forSpeaker.split(":")[0] : "1";
  let max = 0;
  for (const id of existing) {
    const m = /:new(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${recording}:new${max + 1}`;
}

export function useSpeakerManager() {
  const [speakers, setSpeakers] = useState<Map<string, SpeakerInfo>>(
    new Map()
  );

  const registerSpeaker = useCallback((speakerId: string, label?: string) => {
    setSpeakers((prev) => {
      if (prev.has(speakerId)) return prev;
      const next = new Map(prev);
      const index = next.size;
      // First free color: a merged-away speaker leaves a gap, and filling
      // it by count would give two speakers the same color
      const used = new Set(Array.from(prev.values(), (s) => s.color));
      next.set(speakerId, {
        id: speakerId,
        label: label ?? defaultSpeakerLabel(speakerId),
        color:
          SPEAKER_COLORS.find((c) => !used.has(c)) ??
          SPEAKER_COLORS[index % SPEAKER_COLORS.length],
        wordCount: 0,
      });
      return next;
    });
  }, []);

  const renameSpeaker = useCallback((speakerId: string, newLabel: string) => {
    setSpeakers((prev) => {
      const info = prev.get(speakerId);
      if (!info) return prev;
      const next = new Map(prev);
      next.set(speakerId, { ...info, label: newLabel });
      return next;
    });
  }, []);

  const removeSpeaker = useCallback((speakerId: string) => {
    setSpeakers((prev) => {
      if (!prev.has(speakerId)) return prev;
      const next = new Map(prev);
      next.delete(speakerId);
      return next;
    });
  }, []);

  const clearSpeakers = useCallback(() => {
    setSpeakers(new Map());
  }, []);

  return {
    speakers,
    registerSpeaker,
    renameSpeaker,
    removeSpeaker,
    clearSpeakers,
  };
}
