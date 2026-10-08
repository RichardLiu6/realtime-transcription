"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, Download, Loader2, MoreHorizontal, Play, Trash2, X } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguageName, useLocale, useT } from "@/lib/i18n";
import { useStoredState } from "@/lib/useStoredState";
import { triggerBilingualDownload } from "@/lib/exportBilingual";
import { FALLBACK_SPEAKER_COLOR, speakerDisplayName } from "@/hooks/useSpeakerManager";
import { formatClock, formatDate, formatDateTime } from "@/lib/meetings/format";
import { fromSavedEntry, type MeetingDetail, type SavedEntry, type SavedSpeaker } from "@/lib/meetings/types";
import BackfillTranslation from "@/components/meetings/BackfillTranslation";
import { BottomSheet, Row } from "@/components/phone/parts";

// One saved meeting: the transcript with its translations, the recording
// (click a sentence's time to play from there; the playing sentence is
// highlighted), and for the owner: title, speaker names, summary, sharing
// and delete. People it is shared with get the same page read-only.
// Used by /meetings/<id> and, in the phone layout, opened over the
// recording page (`inApp`: back closes it, the page title is left alone).
// Phones get one bar (back · title · ⋯), 记录 / 纪要 tabs and the player
// at the bottom; desktop keeps the two columns.

const ORIGINAL = "original";
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const NONE: string[] = [];

type LoadState = "loading" | "ready" | "notfound" | "error";

const PHONE_QUERY = "(max-width: 1023px)";
function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const isPhoneNow = () => window.matchMedia(PHONE_QUERY).matches;

interface MeetingDetailViewProps {
  id: string;
  // In the app's phone layout: back closes the view
  inApp?: boolean;
  onBack?: () => void;
  onDeleted?: () => void;
}

export default function MeetingDetailView({ id, inApp = false, onBack, onDeleted }: MeetingDetailViewProps) {
  const t = useT();
  const locale = useLocale();
  const langName = useLanguageName();
  const router = useRouter();
  const isPhone = useSyncExternalStore(subscribePhone, isPhoneNow, () => inApp);
  const [tab, setTab] = useState<"transcript" | "summary">("transcript");
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const back = () => (onBack ? onBack() : router.push("/meetings"));
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [load, setLoad] = useState<LoadState>("loading");

  useEffect(() => {
    fetch(`/api/meetings/${id}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404 || r.status === 401) return setLoad("notfound");
        if (!r.ok) throw new Error(String(r.status));
        setMeeting((await r.json()).meeting);
        setLoad("ready");
      })
      .catch(() => setLoad("error"));
  }, [id]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(String(r.status));
    },
    [id]
  );

  // --- Speakers ---
  const speakers = useMemo(() => new Map((meeting?.speakers ?? []).map((s) => [s.id, s])), [meeting]);
  const nameOf = useCallback(
    (speakerId: string) => speakerDisplayName(speakerId, speakers.get(speakerId)?.label, t),
    [speakers, t]
  );

  // --- Languages shown ---
  const mode = meeting?.settings.translationMode;
  // Columns: multilingual meetings, and transcribe-only ones once 补翻译
  // added translations
  const multi =
    mode === "presentation" ||
    (mode === "transcribe" && !!meeting?.entries.some((e) => e.translations && Object.keys(e.translations).length > 0));
  const canBackfill = !!meeting?.isOwner && (mode === "presentation" || mode === "transcribe");
  const mergeTranslated = useCallback((updated: SavedEntry[]) => {
    const byId = new Map(updated.map((e) => [e.id, e]));
    setMeeting((m) => (m ? { ...m, entries: m.entries.map((e) => byId.get(e.id) ?? e) } : m));
  }, []);
  const targetLangs = useMemo(() => {
    if (!meeting || !multi) return [];
    const fromSettings = meeting.settings.targetLangs ?? [];
    const seen = new Set(fromSettings);
    for (const e of meeting.entries) for (const l of Object.keys(e.translations ?? {})) seen.add(l);
    return Array.from(seen);
  }, [meeting, multi]);
  const [storedLangs, setStoredLangs] = useStoredState("meetingLangs", NONE, isStringList);
  const picked = useMemo(() => {
    const offered = storedLangs.filter((l) => l === ORIGINAL || targetLangs.includes(l));
    if (offered.length > 0) return offered;
    return [ORIGINAL, ...(targetLangs.includes(locale) ? [locale] : targetLangs.slice(0, 1))];
  }, [storedLangs, targetLangs, locale]);
  const showOriginal = !multi || picked.includes(ORIGINAL);
  const shownLangs = targetLangs.filter((l) => picked.includes(l));
  const togglePick = (value: string) => {
    const next = picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value];
    if (next.length > 0) setStoredLangs(next);
  };

  // --- Playback across recording segments ---
  const recordings = useMemo(
    () => [...(meeting?.recordings ?? [])].sort((a, b) => a.offsetMs - b.offsetMs),
    [meeting]
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const [segment, setSegment] = useState(0);
  const [reload, setReload] = useState(0);
  const pendingSeek = useRef<{ ms: number; play: boolean } | null>(null);
  const [playMs, setPlayMs] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const segmentFor = useCallback(
    (ms: number) => {
      let i = 0;
      for (let k = 0; k < recordings.length; k++) if (recordings[k].offsetMs <= ms) i = k;
      return i;
    },
    [recordings]
  );

  const playFrom = useCallback(
    (ms: number) => {
      const audio = audioRef.current;
      if (!audio || recordings.length === 0) return;
      const i = segmentFor(ms);
      const rec = recordings[i];
      // In a gap between recordings: start of the next one
      const target = Math.max(0, ms - rec.offsetMs);
      if (i !== segment) {
        pendingSeek.current = { ms: target, play: true };
        setSegment(i);
        return;
      }
      audio.currentTime = target / 1000;
      audio.play().catch(() => {});
    },
    [recordings, segment, segmentFor]
  );

  const onLoadedMetadata = () => {
    const audio = audioRef.current;
    const seek = pendingSeek.current;
    if (!audio || !seek) return;
    pendingSeek.current = null;
    audio.currentTime = seek.ms / 1000;
    if (seek.play) audio.play().catch(() => {});
  };
  const onTimeUpdate = () => {
    const audio = audioRef.current;
    const rec = recordings[segment];
    if (audio && rec) setPlayMs(rec.offsetMs + audio.currentTime * 1000);
  };
  const onEnded = () => {
    if (segment + 1 < recordings.length) {
      pendingSeek.current = { ms: 0, play: true };
      setSegment(segment + 1);
    } else {
      setPlaying(false);
    }
  };
  // The signed storage URL behind the player expires after an hour: load
  // it again (once) where it stopped
  const onError = () => {
    const audio = audioRef.current;
    if (!audio || reload > 3) return;
    pendingSeek.current = { ms: audio.currentTime * 1000, play: !audio.paused };
    setReload((n) => n + 1);
  };

  const entries = useMemo(() => meeting?.entries ?? [], [meeting]);
  // The sentence being played: the last one started at or before the position
  const currentId = useMemo(() => {
    if (playMs === null) return null;
    let found: string | null = null;
    for (const e of entries) {
      if (e.startMs <= playMs + 150) found = e.id;
      else break;
    }
    return found;
  }, [entries, playMs]);
  useEffect(() => {
    if (!playing || !currentId) return;
    document.getElementById(`entry-${currentId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentId, playing]);

  // --- Owner actions ---
  const [title, setTitle] = useState("");
  useEffect(() => {
    if (meeting) setTitle(meeting.title);
  }, [meeting]);

  const saveTitle = () => {
    if (!meeting || title.trim() === meeting.title) return;
    const next = title.trim();
    patch({ title: next })
      .then(() => setMeeting({ ...meeting, title: next }))
      .catch(() => setTitle(meeting.title));
  };

  const renameSpeaker = (s: SavedSpeaker, label: string) => {
    if (!meeting || label.trim() === s.label || !label.trim()) return;
    const next = meeting.speakers.map((x) => (x.id === s.id ? { ...x, label: label.trim() } : x));
    patch({ speakers: next })
      .then(() => setMeeting({ ...meeting, speakers: next }))
      .catch(() => {});
  };

  const [summarizing, setSummarizing] = useState(false);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const summarize = async () => {
    if (!meeting || entries.length === 0) return;
    setSummarizing(true);
    setSummaryFailed(false);
    try {
      const r = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcripts: entries.map((e) => ({
            text: e.originalText,
            language: e.language,
            speaker: nameOf(e.speaker),
            timestamp: formatClock(e.startMs),
          })),
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const summary = String((await r.json()).summary ?? "");
      await patch({ summary });
      setMeeting({ ...meeting, summary });
    } catch {
      setSummaryFailed(true);
    } finally {
      setSummarizing(false);
    }
  };

  const [shareEmail, setShareEmail] = useState("");
  const [shareError, setShareError] = useState("");
  const addShare = async () => {
    if (!meeting) return;
    const email = shareEmail.trim().toLowerCase();
    if (!email) return;
    const r = await fetch(`/api/meetings/${id}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    if (r?.ok) {
      setMeeting({ ...meeting, shares: Array.from(new Set([...meeting.shares, email])) });
      setShareEmail("");
      setShareError("");
      return;
    }
    const code = r ? (await r.json().catch(() => ({})))?.code : null;
    setShareError(code === "own_email" ? t("meeting_share_own_email") : t("meeting_share_bad_email"));
  };
  const removeShare = async (email: string) => {
    if (!meeting) return;
    const r = await fetch(`/api/meetings/${id}/shares`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    if (r?.ok) setMeeting({ ...meeting, shares: meeting.shares.filter((e) => e !== email) });
  };

  const remove = async () => {
    if (!window.confirm(t("meeting_delete_confirm"))) return;
    const r = await fetch(`/api/meetings/${id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      if (onDeleted) onDeleted();
      else router.push("/meetings");
    }
  };

  const exportText = () => {
    triggerBilingualDownload(
      entries.map((e) => ({ ...fromSavedEntry(e), speakerLabel: nameOf(e.speaker) })),
      multi ? { languages: shownLangs, original: showOriginal } : undefined
    );
  };

  const displayTitle = meeting
    ? meeting.title || `${t("meetings_untitled")} · ${formatDateTime(meeting.createdAt, locale)}`
    : t("my_meetings");
  useEffect(() => {
    if (!inApp) document.title = displayTitle;
  }, [displayTitle, inApp]);

  // --- Render ---
  const header = (
    <header className="safe-top safe-x sticky top-0 z-20 border-b border-border bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-2">
        <Link href="/meetings" className="inline-flex items-center gap-1 text-sm text-gray-700 hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          {t("my_meetings")}
        </Link>
        <LanguageSwitcher />
      </div>
    </header>
  );

  // Phone: one bar — back, the title, ⋯ — with the 记录 / 纪要 tabs
  const phoneHeader = (
    <header className="safe-top safe-x sticky top-0 z-20 border-b border-border bg-background">
      <div className="flex items-center gap-1 px-1 py-1">
        <button
          type="button"
          onClick={back}
          aria-label={t("ph_back")}
          data-meeting-back
          className="grid size-10 shrink-0 place-items-center rounded-full text-foreground hover:bg-muted"
        >
          <ChevronLeft className="size-6" />
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold">{meeting ? displayTitle : ""}</p>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          disabled={!meeting}
          aria-label={t("ph_more")}
          data-meeting-menu
          className="grid size-10 shrink-0 place-items-center rounded-full text-foreground hover:bg-muted disabled:invisible"
        >
          <MoreHorizontal className="size-5" />
        </button>
      </div>
      {meeting && (
        <div role="tablist" className="grid grid-cols-2 px-4">
          {(["transcript", "summary"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={tab === v}
              onClick={() => setTab(v)}
              className={`border-b-2 py-2 text-sm ${
                tab === v ? "border-foreground font-semibold text-foreground" : "border-transparent text-gray-600"
              }`}
            >
              {t(v === "transcript" ? "ph_tab_transcript" : "meeting_summary")}
            </button>
          ))}
        </div>
      )}
    </header>
  );

  if (load !== "ready" || !meeting) {
    if (isPhone) {
      return (
        <div className="min-h-full bg-background">
          {phoneHeader}
          <p className="px-4 py-10 text-center text-sm text-gray-700" data-meeting-state={load}>
            {load === "loading" ? t("loading") : load === "notfound" ? t("meeting_not_found") : t("save_error")}
          </p>
        </div>
      );
    }
    return (
      <div className="min-h-dvh bg-background">
        {header}
        <p className="mx-auto max-w-5xl px-4 py-10 text-sm text-gray-700" data-meeting-state={load}>
          {load === "loading" ? t("loading") : load === "notfound" ? t("meeting_not_found") : t("save_error")}
        </p>
      </div>
    );
  }

  const current = recordings[segment];
  // One player element for either layout
  const audio = current ? (
    <audio
      ref={audioRef}
      key={`${current.idx}-${reload}`}
      src={`/api/meetings/${id}/recordings/${current.idx}${reload ? `?r=${reload}` : ""}`}
      controls
      preload="metadata"
      data-meeting-audio
      onLoadedMetadata={onLoadedMetadata}
      onTimeUpdate={onTimeUpdate}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={onEnded}
      onError={onError}
      className="h-9 min-w-0 flex-1"
    />
  ) : null;

  const languagePicker =
    multi && targetLangs.length > 0 ? (
      <div role="group" aria-label={t("live_languages")} data-meeting-languages className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-gray-600">{t("live_languages")}</span>
        {[ORIGINAL, ...targetLangs].map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={picked.includes(v)}
            data-lang={v}
            onClick={() => togglePick(v)}
            className="rounded-full border border-border px-2.5 py-1 text-xs text-gray-700 hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
          >
            {v === ORIGINAL ? t("original_text") : langName(v)}
          </button>
        ))}
      </div>
    ) : null;

  const transcriptList = (compact: boolean) => (
    <ol className={compact ? "divide-y divide-border" : "divide-y divide-border rounded-md border border-border"} data-meeting-transcript>
      {entries.map((e) => (
        <Sentence
          key={e.id}
          entry={e}
          speakerName={nameOf(e.speaker)}
          color={speakers.get(e.speaker)?.color ?? FALLBACK_SPEAKER_COLOR}
          showOriginal={showOriginal}
          langs={multi ? shownLangs : []}
          langName={langName}
          current={e.id === currentId}
          canPlay={recordings.length > 0}
          onPlay={() => playFrom(e.startMs)}
          playLabel={t("meeting_play_here")}
          compact={compact}
        />
      ))}
    </ol>
  );

  const summaryBlock = (
    <section>
      <h2 className="text-sm font-semibold">{t("meeting_summary")}</h2>
      {meeting.summary ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" data-meeting-summary>{meeting.summary}</p>
      ) : (
        <p className="mt-2 text-sm text-gray-600">{t("meeting_no_summary")}</p>
      )}
      {meeting.isOwner && (
        <button
          type="button"
          onClick={summarize}
          disabled={summarizing || entries.length === 0}
          data-summarize
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-60"
        >
          {summarizing && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {summarizing ? t("meeting_summarizing") : t("meeting_summarize")}
        </button>
      )}
      {summaryFailed && <p role="alert" className="mt-1 text-xs text-red-700">{t("meeting_summary_failed")}</p>}
    </section>
  );

  const speakersBlock =
    meeting.speakers.length > 0 ? (
      <section>
        <h2 className="text-sm font-semibold">{t("meeting_speakers")}</h2>
        <ul className="mt-2 space-y-1.5">
          {meeting.speakers.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
              {meeting.isOwner ? (
                <input
                  defaultValue={nameOf(s.id)}
                  onBlur={(e) => renameSpeaker(s, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  aria-label={t("meeting_speakers")}
                  data-speaker-name={s.id}
                  className="min-w-0 flex-1 rounded border border-transparent px-1 py-0.5 hover:border-border focus:border-ring focus:outline-none"
                />
              ) : (
                <span>{nameOf(s.id)}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const shareBlock = meeting.isOwner ? (
    <section>
      <h2 className="text-sm font-semibold">{t("meeting_share")}</h2>
      <p className="mt-1 text-xs text-gray-600">{t("meeting_share_hint")}</p>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          addShare();
        }}
      >
        <input
          type="email"
          value={shareEmail}
          onChange={(e) => setShareEmail(e.target.value)}
          placeholder={t("meeting_share_placeholder")}
          aria-label={t("meeting_share")}
          data-share-email
          className="h-8 min-w-0 flex-1 rounded-md border border-input px-2 text-sm focus:border-ring focus:outline-none"
        />
        <button type="submit" className="h-8 rounded-md border border-border px-2.5 text-sm hover:bg-muted">
          {t("meeting_share_add")}
        </button>
      </form>
      {shareError && <p role="alert" className="mt-1 text-xs text-red-700">{shareError}</p>}
      <ul className="mt-2 space-y-1" data-shares>
        {meeting.shares.map((email) => (
          <li key={email} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{email}</span>
            <button
              type="button"
              onClick={() => removeShare(email)}
              aria-label={t("meeting_share_remove", { email })}
              title={t("meeting_share_remove", { email })}
              className="rounded p-1 text-gray-600 hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  ) : null;

  if (isPhone) {
    return (
      <div className="min-h-full bg-background">
        {phoneHeader}
        <main className={`pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4 ${audio ? "pb-28" : "pb-[max(2rem,env(safe-area-inset-bottom))]"}`}>
          {meeting.isOwner ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              placeholder={`${t("meetings_untitled")} · ${formatDateTime(meeting.createdAt, locale)}`}
              aria-label={t("meeting_title_placeholder")}
              data-meeting-title
              className="-mx-1 w-[calc(100%+0.5rem)] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xl font-bold outline-none focus:border-ring"
            />
          ) : (
            <h1 className="text-xl font-bold" data-meeting-title>{displayTitle}</h1>
          )}
          <p className="mt-1 text-xs text-gray-600">
            {[
              formatDateTime(meeting.createdAt, locale),
              formatClock(meeting.durationMs),
              t("meeting_sentences", { n: meeting.entryCount }),
              !meeting.isOwner ? t("meeting_owner", { email: meeting.ownerEmail }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {tab === "transcript" ? (
            <div className="mt-3">
              {(languagePicker || canBackfill) && (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  {languagePicker ?? <span />}
                  {canBackfill && (
                    <BackfillTranslation meetingId={meeting.id} entries={entries} existing={targetLangs} onTranslated={mergeTranslated} />
                  )}
                </div>
              )}
              {transcriptList(true)}
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              {summaryBlock}
              {speakersBlock}
            </div>
          )}
        </main>

        {audio && (
          <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-border bg-background pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
            {audio}
            {recordings.length > 1 && (
              <span className="shrink-0 text-xs tabular-nums text-gray-600">
                {segment + 1} / {recordings.length}
              </span>
            )}
          </div>
        )}

        <BottomSheet open={menuOpen} onOpenChange={setMenuOpen} title={displayTitle}>
          <Row
            label={t("export")}
            chevron={false}
            onClick={() => {
              setMenuOpen(false);
              exportText();
            }}
          />
          {meeting.isOwner && (
            <Row
              label={t("meeting_share")}
              value={meeting.shares.length > 0 ? String(meeting.shares.length) : undefined}
              onClick={() => {
                setMenuOpen(false);
                setShareOpen(true);
              }}
            />
          )}
          {meeting.isOwner && (
            <Row
              label={t("meeting_delete")}
              danger
              chevron={false}
              onClick={() => {
                setMenuOpen(false);
                remove();
              }}
            />
          )}
          <p className="pt-3 text-xs text-gray-500">{t("meeting_expires", { date: formatDate(meeting.expiresAt, locale) })}</p>
        </BottomSheet>

        <BottomSheet open={shareOpen} onOpenChange={setShareOpen} title={t("meeting_share")}>
          {shareBlock}
        </BottomSheet>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      {header}
      <main className="mx-auto max-w-5xl px-4 py-5">
        {/* Title and facts */}
        {meeting.isOwner ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder={`${t("meetings_untitled")} · ${formatDateTime(meeting.createdAt, locale)}`}
            aria-label={t("meeting_title_placeholder")}
            data-meeting-title
            className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-xl font-semibold outline-none hover:border-border focus:border-ring"
          />
        ) : (
          <h1 className="px-1 text-xl font-semibold" data-meeting-title>{displayTitle}</h1>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-gray-600">
          <span>{formatDateTime(meeting.createdAt, locale)}</span>
          <span className="tabular-nums">{formatClock(meeting.durationMs)}</span>
          <span>{t("meeting_sentences", { n: meeting.entryCount })}</span>
          {!meeting.isOwner && <span>{t("meeting_owner", { email: meeting.ownerEmail })}</span>}
          <span>{t("meeting_expires", { date: formatDate(meeting.expiresAt, locale) })}</span>
        </div>
        {!meeting.isOwner && (
          <p className="mt-2 inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs text-gray-700">{t("meeting_read_only")}</p>
        )}

        {/* Player */}
        <div className="sticky top-[49px] z-10 mt-4 rounded-md border border-border bg-background p-2 shadow-sm">
          {current ? (
            <div className="flex flex-wrap items-center gap-2">
              {audio}
              {recordings.length > 1 && (
                <span className="shrink-0 text-xs tabular-nums text-gray-600">
                  {segment + 1} / {recordings.length}
                </span>
              )}
            </div>
          ) : (
            <p className="px-1 py-1 text-xs text-gray-600" data-no-audio>{t("meeting_no_audio")}</p>
          )}
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Transcript */}
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              {languagePicker ?? <span />}
              {canBackfill && (
                <BackfillTranslation
                  meetingId={meeting.id}
                  entries={entries}
                  existing={targetLangs}
                  onTranslated={mergeTranslated}
                />
              )}
              <button
                type="button"
                onClick={exportText}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm hover:bg-muted"
              >
                <Download className="size-4" aria-hidden />
                {t("export")}
              </button>
            </div>
            {transcriptList(false)}
          </section>

          {/* Summary, speakers, sharing */}
          <aside className="space-y-6">
            {summaryBlock}
            {speakersBlock}
            {shareBlock}

            {meeting.isOwner && (
              <button
                type="button"
                onClick={remove}
                data-delete-meeting
                className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                <Trash2 className="size-3.5" aria-hidden />
                {t("meeting_delete")}
              </button>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

function Sentence({
  entry,
  speakerName,
  color,
  showOriginal,
  langs,
  langName,
  current,
  canPlay,
  onPlay,
  playLabel,
  compact = false,
}: {
  entry: SavedEntry;
  speakerName: string;
  color: string;
  showOriginal: boolean;
  langs: string[];
  langName: (code: string) => string;
  current: boolean;
  canPlay: boolean;
  onPlay: () => void;
  playLabel: string;
  // Phone: speaker and time on one line above the full-width text
  compact?: boolean;
}) {
  if (compact) {
    return (
      <li
        id={`entry-${entry.id}`}
        data-entry={entry.id}
        data-current={current || undefined}
        className={`-mx-4 px-4 py-3 ${current ? "bg-amber-50" : ""}`}
      >
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-semibold" style={{ color }}>
            {speakerName}
          </span>
          {canPlay ? (
            <button
              type="button"
              onClick={onPlay}
              aria-label={`${playLabel} ${formatClock(entry.startMs)}`}
              data-play={entry.id}
              className="inline-flex items-center gap-1 rounded px-1 text-xs tabular-nums text-gray-600 active:bg-muted"
            >
              <Play className="size-3" aria-hidden />
              {formatClock(entry.startMs)}
            </button>
          ) : (
            <span className="text-xs tabular-nums text-gray-500">{formatClock(entry.startMs)}</span>
          )}
        </div>
        <SentenceText entry={entry} showOriginal={showOriginal} langs={langs} langName={langName} />
      </li>
    );
  }
  return (
    <li
      id={`entry-${entry.id}`}
      data-entry={entry.id}
      data-current={current || undefined}
      className={`flex gap-3 px-3 py-2.5 ${current ? "bg-amber-50" : ""}`}
    >
      {canPlay ? (
        <button
          type="button"
          onClick={onPlay}
          aria-label={`${playLabel} ${formatClock(entry.startMs)}`}
          title={playLabel}
          data-play={entry.id}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded px-1 text-xs tabular-nums text-gray-600 hover:bg-muted hover:text-foreground"
        >
          <Play className="size-3" aria-hidden />
          {formatClock(entry.startMs)}
        </button>
      ) : (
        <span className="h-6 shrink-0 px-1 text-xs leading-6 tabular-nums text-gray-600">{formatClock(entry.startMs)}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium" style={{ color }}>
          {speakerName}
        </div>
        <SentenceText entry={entry} showOriginal={showOriginal} langs={langs} langName={langName} />
      </div>
    </li>
  );
}

// What was said, and its translations in the chosen languages
function SentenceText({
  entry,
  showOriginal,
  langs,
  langName,
}: {
  entry: SavedEntry;
  showOriginal: boolean;
  langs: string[];
  langName: (code: string) => string;
}) {
  return (
    <>
    {showOriginal && <p className="mt-0.5 leading-relaxed">{entry.originalText}</p>}
    {langs.length > 0
      ? langs.map((l) =>
          entry.translations?.[l] ? (
            <p key={l} className="mt-1 border-l-2 border-gray-200 pl-2.5 leading-relaxed text-gray-800">
              <span className="mr-1.5 text-xs text-gray-600">{langName(l)}</span>
              {entry.translations[l]}
            </p>
          ) : entry.language === l && !showOriginal ? (
            // Spoken in this language and not translated into it: the
            // original is its text here
            <p key={l} className="mt-1 border-l-2 border-gray-200 pl-2.5 leading-relaxed text-gray-800">
              <span className="mr-1.5 text-xs text-gray-600">{langName(l)}</span>
              {entry.originalText}
            </p>
          ) : null
        )
      : entry.translatedText && (
          <p className="mt-1 border-l-2 border-gray-200 pl-2.5 leading-relaxed text-gray-800">{entry.translatedText}</p>
        )}
    </>
  );
}
