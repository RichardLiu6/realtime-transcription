"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Download, MonitorPlay } from "lucide-react";
import PresentationPanel from "@/components/PresentationPanel";
import PresentationMode, { usePresentationMode } from "@/components/PresentationMode";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLocale, useT } from "@/lib/i18n";
import { useStoredState } from "@/lib/useStoredState";
import { triggerBilingualDownload } from "@/lib/exportBilingual";
import { speakerDisplayName } from "@/hooks/useSpeakerManager";
import { SONIOX_LANGUAGES, type BilingualEntry, type SpeakerInfo } from "@/types/bilingual";
import { fromLiveEntry, ROOM_ID_PATTERN, type LiveInfo, type LivePollResponse } from "@/lib/live/types";

// Shared live captions (no login): polls the host's room once a second and
// shows the multilingual view with the columns this viewer picked — the
// original and/or any of the host's languages.

// Upstash bills per command: poll every second while people talk, every
// 2 s after 30 s of silence, and confirm the room still exists every 15 s
// (a plain delta read can't tell "nothing new" from "sharing stopped")
const POLL_MS = 1000;
const IDLE_POLL_MS = 2000;
const IDLE_AFTER_MS = 30_000;
const CHECK_EVERY_MS = 15_000;
const RETRY_MS = 3000;
// No heartbeat (every 15 s) for this long: the host has gone
const OFFLINE_AFTER_MS = 45_000;
const ORIGINAL = "original";

type Status = "connecting" | "live" | "reconnecting" | "ended" | "notfound";

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const NONE: string[] = [];

function nativeName(code: string): string {
  return SONIOX_LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase();
}

export default function LiveViewerPage() {
  const t = useT();
  const locale = useLocale();
  const { room } = useParams<{ room: string }>();
  const [entries, setEntries] = useState<Map<string, BilingualEntry>>(new Map());
  const [info, setInfo] = useState<LiveInfo | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  // Host liveness, in server time (no clock skew between host and viewer)
  const [lastAt, setLastAt] = useState(0);
  const [serverNow, setServerNow] = useState(0);
  const [storedLangs, setStoredLangs] = useStoredState("liveLangs", NONE, isStringList);
  const presentation = usePresentationMode();

  // Poll: a snapshot first, then only what changed since our version
  useEffect(() => {
    if (!ROOM_ID_PATTERN.test(room ?? "")) {
      setStatus("notfound");
      return;
    }
    let version = 0;
    let everLoaded = false;
    let lastActivity = Date.now();
    let lastCheck = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      let next = POLL_MS;
      try {
        const check = version > 0 && Date.now() - lastCheck >= CHECK_EVERY_MS;
        const res = await fetch(`/api/live/${room}?since=${version}${check ? "&check=1" : ""}`, { cache: "no-store" });
        if (check) lastCheck = Date.now();
        if (res.status === 404) {
          // Deleted: the host stopped sharing (or the link was never valid)
          setStatus(everLoaded ? "ended" : "notfound");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as LivePollResponse;
        if (stopped) return;
        everLoaded = true;
        setServerNow(data.now);
        if (data.snapshot) {
          const map = new Map<string, BilingualEntry>();
          // Redis doesn't keep a hash's order: back into spoken order
          const sorted = [...data.entries].sort((a, b) => a.startMs - b.startMs || a.at - b.at);
          for (const e of sorted) map.set(e.id, fromLiveEntry(e));
          setEntries(map);
          if (data.info) {
            setInfo(data.info);
            setLastAt(data.info.at ?? 0);
          }
        } else if (data.batches.length > 0) {
          setEntries((prev) => {
            let map = prev;
            for (const b of data.batches) {
              if (b.reset) map = new Map();
              else if (map === prev) map = new Map(prev);
              for (const e of b.entries ?? []) map.set(e.id, fromLiveEntry(e));
            }
            return map;
          });
          const withInfo = data.batches.filter((b) => b.info);
          if (withInfo.length > 0) setInfo(withInfo[withInfo.length - 1].info!);
          setLastAt(data.batches[data.batches.length - 1].at);
          if (data.batches.some((b) => b.entries || b.reset)) lastActivity = Date.now();
          if (data.batches.some((b) => b.ended)) {
            setStatus("ended");
            return;
          }
          // Still catching up: fetch the rest right away
          if (data.batches.length >= 300) next = 0;
        }
        if (next > 0 && Date.now() - lastActivity > IDLE_AFTER_MS) next = IDLE_POLL_MS;
        version = data.version;
        setStatus("live");
      } catch {
        next = RETRY_MS;
        setStatus(everLoaded ? "reconnecting" : "connecting");
      }
      if (!stopped) timer = setTimeout(poll, next);
    };

    poll();
    // Back from the background (phone switched to the call app): catch up now
    const onVisible = () => {
      if (document.visibilityState === "visible" && !stopped) {
        lastActivity = Date.now();
        clearTimeout(timer);
        poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [room]);

  const targetLangs = useMemo(() => info?.targetLangs ?? [], [info]);
  // The viewer's columns: its stored pick among what the host offers, else
  // the original plus the interface language when the host has it
  const picked = useMemo(() => {
    const offered = storedLangs.filter((l) => l === ORIGINAL || targetLangs.includes(l));
    if (offered.length > 0) return offered;
    const mine = targetLangs.includes(locale) ? [locale] : [];
    return [ORIGINAL, ...mine];
  }, [storedLangs, targetLangs, locale]);
  const showOriginal = picked.includes(ORIGINAL);
  // In the host's column order
  const shownLangs = useMemo(() => targetLangs.filter((l) => picked.includes(l)), [targetLangs, picked]);

  const togglePick = useCallback(
    (value: string) => {
      const next = picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value];
      if (next.length === 0) return; // at least one column
      setStoredLangs(next);
    },
    [picked, setStoredLangs]
  );

  const speakers = useMemo(() => {
    const map = new Map<string, SpeakerInfo>();
    for (const s of info?.speakers ?? []) map.set(s.id, { ...s, wordCount: 0 });
    return map;
  }, [info]);

  const list = useMemo(() => Array.from(entries.values()), [entries]);
  const offline = status === "live" && lastAt > 0 && serverNow - lastAt > OFFLINE_AFTER_MS;
  const recording = !!info?.recording && !offline;

  const handleExport = useCallback(() => {
    triggerBilingualDownload(
      list.map((e) => ({ ...e, speakerLabel: speakerDisplayName(e.speaker, speakers.get(e.speaker)?.label, t) })),
      { languages: shownLangs, original: showOriginal }
    );
  }, [list, speakers, shownLangs, showOriginal, t]);

  const titleRef = useRef("");
  useEffect(() => {
    titleRef.current = document.title;
    document.title = t("live_title");
    return () => {
      document.title = titleRef.current;
    };
  }, [t]);

  if (status === "notfound") {
    return (
      <main className="safe-top safe-x flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-base text-gray-700" data-live-status="notfound">
          {t("live_not_found")}
        </p>
        <LanguageSwitcher />
      </main>
    );
  }

  const statusText =
    status === "ended"
      ? t("live_status_ended")
      : status === "reconnecting"
      ? t("live_status_reconnecting")
      : status === "connecting"
      ? t("connecting")
      : offline
      ? t("live_status_offline")
      : recording
      ? t("live_status_live")
      : t("live_status_paused");
  const statusKey = status === "live" ? (offline ? "offline" : recording ? "live" : "paused") : status;
  const dot =
    statusKey === "live" ? "bg-red-500 recording-pulse" : statusKey === "paused" ? "bg-amber-500" : "bg-gray-400";

  const options = [
    { value: ORIGINAL, label: t("original_text") },
    ...targetLangs.map((l) => ({ value: l, label: nativeName(l) })),
  ];

  return (
    <div className="safe-top safe-x flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border bg-background px-3 py-2 sm:px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold">{t("live_title")}</h1>
            <span
              data-live-status={statusKey}
              role="status"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-gray-700"
            >
              <span className={`size-2 rounded-full ${dot}`} aria-hidden />
              {statusText}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={handleExport}
              disabled={list.length === 0}
              aria-label={t("export")}
              title={t("export")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">{t("export")}</span>
            </button>
            <button
              type="button"
              onClick={presentation.enter}
              aria-label={t("present")}
              title={t("present_title")}
              data-present-button
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm hover:bg-muted"
            >
              <MonitorPlay className="size-4" />
              <span className="hidden sm:inline">{t("present")}</span>
            </button>
          </div>
        </div>
        {targetLangs.length > 0 && (
          <div
            role="group"
            aria-label={t("live_languages")}
            data-live-languages
            className="mt-2 flex items-center gap-1.5 overflow-x-auto"
          >
            <span className="mr-1 shrink-0 text-xs text-gray-600">{t("live_languages")}</span>
            {options.map((o) => {
              const on = picked.includes(o.value);
              const last = on && picked.length === 1;
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={on}
                  data-lang={o.value}
                  onClick={() => togglePick(o.value)}
                  title={last ? t("live_pick_one") : undefined}
                  className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-gray-700 transition-colors hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        )}
      </header>

      <PresentationPanel
        entries={list}
        currentInterim=""
        speakers={speakers}
        isRecording={recording}
        isConnecting={false}
        languageA={info?.languageA ?? []}
        targetLangs={shownLangs}
        showOriginal={showOriginal}
        viewer
        onStart={() => {}}
      />

      {presentation.open && (
        <PresentationMode
          entries={list}
          speakers={speakers}
          translationMode="presentation"
          languageA={info?.languageA ?? []}
          languageB=""
          targetLangs={shownLangs.length > 0 ? shownLangs : targetLangs}
          recordingState={recording ? "recording" : "idle"}
          elapsedSeconds={0}
          onExit={presentation.exit}
        />
      )}
    </div>
  );
}
