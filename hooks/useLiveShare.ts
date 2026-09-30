"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BilingualEntry, SpeakerInfo } from "@/types/bilingual";
import { toLiveEntry, type LiveInfo } from "@/lib/live/types";

// Host side of live caption sharing (multilingual mode): once a second,
// publish the entries that changed since the last publish (the live
// sentence changes with every word) plus the room info when it changed;
// a heartbeat every 15 s tells viewers the host is still there.

const PUBLISH_INTERVAL_MS = 1000;
const HEARTBEAT_MS = 15_000;
// The server takes at most 200 entries per publish; a long meeting shared
// late goes out over several ticks
const MAX_ENTRIES_PER_PUBLISH = 150;

interface Share {
  room: string;
  hostKey: string;
}

interface UseLiveShareOptions {
  entries: BilingualEntry[];
  speakers: Map<string, SpeakerInfo>;
  targetLangs: string[];
  languageA: string[];
  recording: boolean;
}

export function useLiveShare({ entries, speakers, targetLangs, languageA, recording }: UseLiveShareOptions) {
  const [available, setAvailable] = useState(false);
  const [share, setShare] = useState<Share | null>(null);
  const [starting, setStarting] = useState(false);
  // Publishing keeps failing (network, server): shown next to the link
  const [failing, setFailing] = useState(false);

  useEffect(() => {
    fetch("/api/live")
      .then((r) => r.json())
      .then((d) => setAvailable(!!d.available))
      .catch(() => {});
  }, []);

  // Latest values for the publish loop (it runs on a timer, not on render)
  const infoOf = useCallback(
    (): LiveInfo => ({
      targetLangs,
      languageA,
      speakers: Array.from(speakers.values()).map((s) => ({ id: s.id, label: s.label, color: s.color })),
      recording,
    }),
    [targetLangs, languageA, speakers, recording]
  );
  const latest = useRef({ entries, infoOf });
  latest.current = { entries, infoOf };

  const start = useCallback(async () => {
    if (share || starting) return;
    setStarting(true);
    try {
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ info: latest.current.infoOf() }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setShare(await res.json());
      setFailing(false);
    } catch {
      setFailing(true);
    } finally {
      setStarting(false);
    }
  }, [share, starting]);

  const stop = useCallback(() => {
    if (!share) return;
    setShare(null);
    setFailing(false);
    // Best effort: the room also expires on its own
    fetch(`/api/live/${share.room}`, { method: "DELETE", headers: { "x-live-host": share.hostKey } }).catch(() => {});
  }, [share]);

  // The publish loop, for as long as the share lasts
  useEffect(() => {
    if (!share) return;
    // What viewers already have: entry object per id (entries are replaced,
    // not mutated, when they change) and the last info sent
    const sent = new Map<string, BilingualEntry>();
    let sentInfo = "";
    let lastBeat = 0;
    let busy = false;
    let failures = 0;
    let stopped = false;
    // A reset not yet delivered (kept across failed publishes)
    let pendingReset = false;

    const tick = async () => {
      if (busy || stopped) return;
      const { entries: current, infoOf: getInfo } = latest.current;
      const currentIds = new Set(current.map((e) => e.id));
      // 新会议 cleared the transcript: viewers start over too
      if (Array.from(sent.keys()).some((id) => !currentIds.has(id))) {
        pendingReset = true;
        sent.clear();
      }
      const reset = pendingReset;
      const changed = current.filter(
        (e) => sent.get(e.id) !== e && (e.isFinal || e.originalText || e.interimOriginal)
      );
      const batch = changed.slice(0, MAX_ENTRIES_PER_PUBLISH);
      const info = getInfo();
      const infoJson = JSON.stringify(info);
      const beat = Date.now() - lastBeat >= HEARTBEAT_MS;
      if (!reset && batch.length === 0 && infoJson === sentInfo && !beat) return;

      busy = true;
      try {
        const res = await fetch(`/api/live/${share.room}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-live-host": share.hostKey },
          body: JSON.stringify({
            ...(batch.length > 0 ? { entries: batch.map(toLiveEntry) } : {}),
            // Always with the heartbeat: it carries the "host is here" time
            ...(infoJson !== sentInfo || beat ? { info } : {}),
            ...(reset ? { reset: true } : {}),
            ...(beat ? { touch: true } : {}),
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        for (const e of batch) sent.set(e.id, e);
        if (reset) pendingReset = false;
        sentInfo = infoJson;
        if (beat) lastBeat = Date.now();
        failures = 0;
        setFailing(false);
      } catch {
        // Not marked as sent: the same changes go out on the next tick
        failures += 1;
        if (failures >= 3) setFailing(true);
      } finally {
        busy = false;
      }
    };

    tick();
    const timer = setInterval(tick, PUBLISH_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [share]);

  const viewerUrl = share ? `${typeof window !== "undefined" ? window.location.origin : ""}/live/${share.room}` : null;

  return { available, sharing: !!share, starting, failing, viewerUrl, start, stop };
}
