"use client";

import { memo, useEffect, useRef, useState, useCallback } from "react";
import { ChevronDown, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BilingualEntry, SpeakerInfo } from "@/types/bilingual";
import { useT } from "@/lib/i18n";

// Soniox Compare style: 25 hex colors for speakers
const SPEAKER_COLORS = [
  "#007ecc", "#5aa155", "#e0585b", "#f18f3b", "#77b7b2",
  "#edc958", "#af7aa0", "#fe9ea8", "#9c7561", "#bab0ac",
  "#8884d8", "#82ca9d", "#ff7f0e", "#1f77b4", "#d62728",
  "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22",
  "#17becf", "#aec7e8", "#c5b0d5", "#ffbb78", "#98df8a",
];

function getSpeakerColor(speakerNum: number): string {
  return SPEAKER_COLORS[(speakerNum - 1) % SPEAKER_COLORS.length];
}

function getLanguageLabel(code: string): string {
  return code.toUpperCase();
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

interface TranscriptPanelProps {
  entries: BilingualEntry[];
  currentInterim: string;
  speakers: Map<string, SpeakerInfo>;
  isRecording: boolean;
  languageA: string[];
  languageB: string;
  onReassignSpeaker: (entryId: string, newSpeaker: string) => void;
}

interface EntryRowProps {
  entry: BilingualEntry;
  showSpeakerHeader: boolean;
  speakerName: string;
  translationLabel: string;
  // Only passed while this row's speaker picker is open, so other rows keep
  // stable props and skip re-rendering
  speakerOptions: SpeakerInfo[] | null;
  onStartEdit: (entryId: string) => void;
  onEndEdit: () => void;
  onReassignSpeaker: (entryId: string, newSpeaker: string) => void;
}

// Memoized: while recording, only the live (non-final) row and rows whose
// translation just arrived re-render — not the whole transcript.
const EntryRow = memo(function EntryRow({
  entry,
  showSpeakerHeader,
  speakerName,
  translationLabel,
  speakerOptions,
  onStartEdit,
  onEndEdit,
  onReassignSpeaker,
}: EntryRowProps) {
  const speakerColor = getSpeakerColor(Number(entry.speaker) || 1);

  return (
    <div className="inline">
      {/* Speaker header (only when speaker changes) */}
      {showSpeakerHeader && (
        <div className="mt-4 first:mt-0 mb-1 flex items-center gap-2">
          {speakerOptions ? (
            <select
              autoFocus
              value={entry.speaker}
              onChange={(e) => {
                onReassignSpeaker(entry.id, e.target.value);
                onEndEdit();
              }}
              onBlur={onEndEdit}
              className="rounded border border-blue-300 bg-white px-2 py-0.5 text-sm font-semibold focus:outline-none"
              style={{ color: speakerColor }}
            >
              {speakerOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => onStartEdit(entry.id)}
              className="text-sm font-semibold uppercase tracking-wide hover:opacity-70 transition"
              style={{ color: speakerColor }}
            >
              {speakerName}
            </button>
          )}
          <span className="text-xs text-gray-300">
            {formatTime(entry.startMs)}
          </span>
        </div>
      )}

      {/* Language badge — always show per entry when language is known */}
      {entry.language && (
        <span className="inline-block mr-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
          {getLanguageLabel(entry.language)}
        </span>
      )}

      {/* Original text */}
      {entry.isFinal ? (
        <span
          title={`${formatTime(entry.startMs)}${entry.endMs > 0 ? ` – ${formatTime(entry.endMs)}` : ""}`}
          className="text-foreground leading-relaxed hover:text-primary rounded cursor-default transition-colors"
        >
          {entry.originalText}
        </span>
      ) : (
        <>
          {entry.originalText && (
            <span className="text-gray-500 leading-relaxed">
              {entry.originalText}
            </span>
          )}
          {entry.interimOriginal && (
            <span className="text-gray-400 italic leading-relaxed">
              {entry.interimOriginal}
            </span>
          )}
          <span className="blink-cursor ml-0.5 inline-block h-4 w-0.5 bg-gray-400 align-text-bottom" />
        </>
      )}

      {/* Translation text (smaller, italic, muted - below original) */}
      {entry.translatedText && (
        <>
          <br />
          <span className="inline-block mr-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
            {translationLabel}
          </span>
          <span
            className={`text-sm italic leading-relaxed ${
              entry.translationProvisional ? "text-gray-300" : "text-gray-400"
            }`}
          >
            {entry.translatedText}
          </span>
          <div className="h-2" />
        </>
      )}
    </div>
  );
});

function TranscriptPanel({
  entries,
  currentInterim,
  speakers,
  isRecording,
  languageA,
  languageB,
  onReassignSpeaker,
}: TranscriptPanelProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [editingSpeakerEntryId, setEditingSpeakerEntryId] = useState<
    string | null
  >(null);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, []);

  const handleStartEdit = useCallback((entryId: string) => {
    setEditingSpeakerEntryId(entryId);
  }, []);
  const handleEndEdit = useCallback(() => {
    setEditingSpeakerEntryId(null);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = 60;
      const atBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      setIsAtBottom(atBottom);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Follow new text. Jump instantly (once per frame): restarting a smooth
  // scroll animation on every token update is what made the view stutter.
  useEffect(() => {
    if (!isAtBottom) return;
    const el = containerRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [entries, currentInterim, isAtBottom]);

  const showEmpty = entries.length === 0 && !currentInterim;
  const languageAPrimary = languageA[0] === "*" ? "zh" : (languageA[0] ?? "zh");

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-white">
      <div
        ref={containerRef}
        className="transcript-scroll flex-1 overflow-y-auto px-5 py-4"
      >
        {/* Empty state */}
        {showEmpty && (
          <div className="flex flex-1 items-center justify-center py-20">
            {isRecording ? (
              <div className="text-center">
                <div className="mb-3 flex justify-center gap-2">
                  <span className="listening-dot inline-block h-3 w-3 rounded-full bg-blue-500" />
                  <span className="listening-dot inline-block h-3 w-3 rounded-full bg-blue-500" />
                  <span className="listening-dot inline-block h-3 w-3 rounded-full bg-blue-500" />
                </div>
                <p className="text-sm text-gray-400">{t("listening")}</p>
              </div>
            ) : (
              <div className="text-center text-muted-foreground/40">
                <Mic className="mx-auto size-16" strokeWidth={1} />
                <p className="mt-2 text-sm">
                  {t("click_start")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Entries: Soniox Compare style - single column, flowing text */}
        {entries.map((entry, i) => {
          const isEditing = editingSpeakerEntryId === entry.id;
          return (
            <EntryRow
              key={entry.id}
              entry={entry}
              showSpeakerHeader={i === 0 || entries[i - 1].speaker !== entry.speaker}
              speakerName={speakers.get(entry.speaker)?.label || `Speaker ${entry.speaker}`}
              // Mirrors the target selection in requestTranslation: text in
              // language B goes to language A, everything else to language B
              translationLabel={getLanguageLabel(
                entry.language === languageB ? languageAPrimary : languageB
              )}
              speakerOptions={isEditing ? Array.from(speakers.values()) : null}
              onStartEdit={handleStartEdit}
              onEndEdit={handleEndEdit}
              onReassignSpeaker={onReassignSpeaker}
            />
          );
        })}

        {/* Global interim text (from hook's currentInterim, if any) */}
        {currentInterim && entries.length > 0 && (
          <span className="text-gray-400 italic">
            {currentInterim}
            <span className="blink-cursor ml-0.5 inline-block h-4 w-0.5 bg-gray-400 align-text-bottom" />
          </span>
        )}
      </div>

      {/* Floating interim bubble (only when no entries yet) */}
      {currentInterim && entries.length === 0 && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 justify-center">
          <div className="relative max-w-[80%] rounded-2xl bg-gray-800/90 px-5 py-3 text-white shadow-xl backdrop-blur-sm">
            <p className="text-sm leading-relaxed">
              {currentInterim}
              <span className="blink-cursor ml-0.5 inline-block h-4 w-0.5 bg-white/70 align-text-bottom" />
            </p>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
              <div className="h-0 w-0 border-x-[8px] border-t-[8px] border-x-transparent border-t-gray-800/90" />
            </div>
          </div>
        </div>
      )}

      {/* Scroll-to-bottom button */}
      {!isAtBottom && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 z-20 rounded-full bg-zinc-500/30 text-white shadow-lg backdrop-blur-sm hover:bg-zinc-600/80 hover:text-white"
        >
          <ChevronDown className="size-4" />
        </Button>
      )}
    </div>
  );
}

// Memoized so the once-per-second recording timer in the page doesn't
// re-render the transcript
export default memo(TranscriptPanel);
