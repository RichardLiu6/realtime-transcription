"use client";

import { useState, useCallback } from "react";
import type { SpeakerInfo } from "@/types/bilingual";

const SPEAKER_COLORS = [
  "bg-indigo-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-cyan-500",
  "bg-rose-500",
  "bg-emerald-500",
];

export function useSpeakerManager() {
  const [speakers, setSpeakers] = useState<Map<number, SpeakerInfo>>(
    new Map()
  );

  const registerSpeaker = useCallback((speakerId: number) => {
    setSpeakers((prev) => {
      if (prev.has(speakerId)) return prev;
      const next = new Map(prev);
      const index = next.size;
      next.set(speakerId, {
        id: speakerId,
        label: `Speaker ${index + 1}`,
        color: SPEAKER_COLORS[index % SPEAKER_COLORS.length],
        wordCount: 0,
      });
      return next;
    });
  }, []);

  const renameSpeaker = useCallback((speakerId: number, newLabel: string) => {
    setSpeakers((prev) => {
      const info = prev.get(speakerId);
      if (!info) return prev;
      const next = new Map(prev);
      next.set(speakerId, { ...info, label: newLabel });
      return next;
    });
  }, []);

  const getSpeakerLabel = useCallback(
    (speakerId: number): string => {
      return speakers.get(speakerId)?.label ?? `Speaker ${speakerId}`;
    },
    [speakers]
  );

  const getSpeakerColor = useCallback(
    (speakerId: number): string => {
      return (
        speakers.get(speakerId)?.color ??
        SPEAKER_COLORS[speakerId % SPEAKER_COLORS.length]
      );
    },
    [speakers]
  );

  const updateWordCount = useCallback(
    (speakerId: number, count: number) => {
      setSpeakers((prev) => {
        const info = prev.get(speakerId);
        if (!info) return prev;
        const next = new Map(prev);
        next.set(speakerId, { ...info, wordCount: info.wordCount + count });
        return next;
      });
    },
    []
  );

  const clearSpeakers = useCallback(() => {
    setSpeakers(new Map());
  }, []);

  return {
    speakers,
    registerSpeaker,
    renameSpeaker,
    getSpeakerLabel,
    getSpeakerColor,
    updateWordCount,
    clearSpeakers,
  };
}
