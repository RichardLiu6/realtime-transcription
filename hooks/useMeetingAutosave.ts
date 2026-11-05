"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BilingualEntry, SpeakerInfo } from "@/types/bilingual";
import { toSavedEntry, type MeetingSettings } from "@/lib/meetings/types";
import type { RecordingsMode } from "@/hooks/useMeetingRecorder";
import { isNativeApp } from "@/lib/native/stt";
import { getLocale } from "@/lib/i18n";

// Saved meetings, text part: a meeting is created when a recording starts
// (the recorder needs its id) and every 3 s the finalized sentences that
// changed since the last save go to the server with the speakers, settings
// and duration. 新会议 (cleared transcript) ends it; the next recording
// starts a new one. Stop/start within a meeting continues the same one.

const SAVE_INTERVAL_MS = 3000;
const MAX_ENTRIES_PER_SAVE = 200;
// An untitled meeting gets a title written from its opening, once: after
// this much of it, or when the recording stops with a few sentences saved
// (the server never replaces a title the owner gave)
const TITLE_AFTER_MS = 3 * 60_000;
const TITLE_MIN_SENTENCES = 3;

export type SaveStatus = "off" | "saving" | "saved" | "error";

interface Options {
  entries: BilingualEntry[];
  speakers: Map<string, SpeakerInfo>;
  settings: MeetingSettings;
  recording: boolean;
}

export function useMeetingAutosave({ entries, speakers, settings, recording }: Options) {
  const [available, setAvailable] = useState(false);
  const [recordingsMode, setRecordingsMode] = useState<RecordingsMode | null>(null);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("off");

  useEffect(() => {
    fetch("/api/meetings/config")
      .then((r) => r.json())
      .then((d) => {
        setAvailable(!!d.available);
        // In the mobile app the microphone is native: no browser recording
        // of the meeting audio (yet)
        const mode = d.recordings === "blob" || d.recordings === "local" ? d.recordings : null;
        setRecordingsMode(isNativeApp() ? null : mode);
      })
      .catch(() => {});
  }, []);

  const latest = useRef({ entries, speakers, settings, recording });
  latest.current = { entries, speakers, settings, recording };
  const titleAsked = useRef(new Set<string>());
  const creating = useRef(false);

  // A recording starts: open a meeting unless this transcript has one
  useEffect(() => {
    if (!available || !recording || meetingId || creating.current) return;
    creating.current = true;
    fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: latest.current.settings }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setMeetingId(d.id);
        setStatus("saved");
      })
      .catch(() => setStatus("error"))
      .finally(() => {
        creating.current = false;
      });
  }, [available, recording, meetingId]);

  // 新会议: a transcript that had sentences was cleared — this meeting is
  // done (a meeting is created before its first sentence, so an empty
  // transcript alone means nothing)
  const hadEntries = useRef(false);
  useEffect(() => {
    if (entries.length > 0) {
      hadEntries.current = true;
    } else if (hadEntries.current) {
      hadEntries.current = false;
      setMeetingId(null);
      setStatus("off");
    }
  }, [entries.length]);

  // What the server already has, for the current meeting
  const sent = useRef(new Map<string, BilingualEntry>());
  const sentMeta = useRef("");
  const busy = useRef(false);

  // Ask for the automatic title once the opening is saved
  const maybeTitle = useCallback((id: string, durationMs: number) => {
    const opening = durationMs >= TITLE_AFTER_MS || !latest.current.recording;
    if (!opening || sent.current.size < TITLE_MIN_SENTENCES || titleAsked.current.has(id)) return;
    titleAsked.current.add(id);
    void fetch(`/api/meetings/${id}/title`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uiLocale: getLocale() }),
    }).catch(() => titleAsked.current.delete(id));
  }, []);

  const save = useCallback(
    async (id: string, keepalive = false) => {
      if (busy.current) return;
      const { entries: current, speakers: sp, settings: st } = latest.current;
      // Cleared by 新会议: nothing of this meeting left to save (and an
      // empty speaker list must not overwrite the saved one)
      if (current.length === 0) return;
      const changed = current.filter((e) => e.isFinal && e.originalText && sent.current.get(e.id) !== e);
      const batch = changed.slice(0, MAX_ENTRIES_PER_SAVE);
      const meta = {
        speakers: Array.from(sp.values()).map((s) => ({ id: s.id, label: s.label, color: s.color })),
        settings: st,
        durationMs: Math.max(0, ...current.map((e) => e.endMs || e.startMs || 0)),
      };
      const metaJson = JSON.stringify(meta);
      if (batch.length === 0 && metaJson === sentMeta.current) return;
      busy.current = true;
      setStatus("saving");
      try {
        const res = await fetch(`/api/meetings/${id}/entries`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: batch.map(toSavedEntry), ...meta }),
          keepalive,
        });
        if (!res.ok) throw new Error(String(res.status));
        for (const e of batch) sent.current.set(e.id, e);
        sentMeta.current = metaJson;
        setStatus(changed.length > batch.length ? "saving" : "saved");
        maybeTitle(id, meta.durationMs);
      } catch {
        // Not marked as sent: retried on the next tick
        setStatus("error");
      } finally {
        busy.current = false;
      }
    },
    [maybeTitle]
  );

  useEffect(() => {
    if (!meetingId) return;
    sent.current = new Map();
    sentMeta.current = "";
    const timer = setInterval(() => save(meetingId), SAVE_INTERVAL_MS);
    // Closing or reloading the tab: send what's left (small bodies only)
    const onHide = () => {
      if (document.visibilityState === "hidden") save(meetingId, true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      // Leaving the page (in-app navigation): the last changes
      save(meetingId);
    };
  }, [meetingId, save]);

  // Recording stopped: save the last sentences now rather than in 3 s
  useEffect(() => {
    if (!recording && meetingId) {
      const t = setTimeout(() => {
        void save(meetingId).then(() => maybeTitle(meetingId, 0));
      }, 800);
      return () => clearTimeout(t);
    }
  }, [recording, meetingId, save, maybeTitle]);

  return { available, recordingsMode, meetingId, status };
}
