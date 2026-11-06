"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useStoredState } from "@/lib/useStoredState";
import { cleanTopic } from "@/lib/termPackTypes";

// The meeting's topic (per device, like the term selection) and the recent
// ones to pick again: this device's last few, then the topics of the
// account's latest saved meetings (the same on every device)
const MAX_RECENT = 8;
const isString = (v: unknown): v is string => typeof v === "string";
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const NONE: string[] = [];

// The account's topics, read once per page (none for guests / no database)
let accountTopics: string[] = NONE;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  loading ??= fetch("/api/meetings?topics=1")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (isStrings(d?.topics)) {
        accountTopics = d.topics;
        listeners.forEach((l) => l());
      }
    })
    .catch(() => {});
  return () => listeners.delete(onChange);
}

export function useMeetingTopic() {
  const [topic, setStoredTopic] = useStoredState("meetingTopic", "", isString);
  const [local, setLocal] = useStoredState("recentTopics", NONE, isStrings);
  const account = useSyncExternalStore(subscribe, () => accountTopics, () => NONE);
  const recent = Array.from(new Set([...local, ...account])).slice(0, MAX_RECENT);
  const setTopic = useCallback((value: string) => setStoredTopic(value.slice(0, 300)), [setStoredTopic]);
  // On start: the topic recorded under goes to the front of the recent ones
  const remember = useCallback(
    (value: string) => {
      const clean = cleanTopic(value);
      if (!clean) return;
      setLocal([clean, ...local.filter((r) => r !== clean)].slice(0, MAX_RECENT));
    },
    [local, setLocal]
  );
  return { topic, setTopic, recent, remember };
}
