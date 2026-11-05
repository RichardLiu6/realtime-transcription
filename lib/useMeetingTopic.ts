"use client";

import { useCallback } from "react";
import { useStoredState } from "@/lib/useStoredState";
import { cleanTopic } from "@/lib/termPackTypes";

// The meeting's topic (per device, like the term selection) and the last
// few used, to pick again
const MAX_RECENT = 5;
const isString = (v: unknown): v is string => typeof v === "string";
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const NONE: string[] = [];

export function useMeetingTopic() {
  const [topic, setStoredTopic] = useStoredState("meetingTopic", "", isString);
  const [recent, setRecent] = useStoredState("recentTopics", NONE, isStrings);
  const setTopic = useCallback((value: string) => setStoredTopic(value.slice(0, 300)), [setStoredTopic]);
  // On start: the topic recorded under goes to the front of the recent ones
  const remember = useCallback(
    (value: string) => {
      const clean = cleanTopic(value);
      if (!clean) return;
      setRecent([clean, ...recent.filter((r) => r !== clean)].slice(0, MAX_RECENT));
    },
    [recent, setRecent]
  );
  return { topic, setTopic, recent, remember };
}
