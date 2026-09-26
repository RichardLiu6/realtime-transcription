"use client";

import { memo, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ChevronDown, Mic, UserRoundPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BilingualEntry, SpeakerInfo } from "@/types/bilingual";
import { useT } from "@/lib/i18n";
import { FALLBACK_SPEAKER_COLOR, speakerDisplayName } from "@/hooks/useSpeakerManager";

function getLanguageLabel(code: string): string {
  return code.toUpperCase();
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// A speaker as the rows show it: the display name (given, or the default in
// the interface language) and the color from SpeakerInfo
interface SpeakerOption {
  id: string;
  name: string;
  color: string;
}

interface TranscriptPanelProps {
  entries: BilingualEntry[];
  currentInterim: string;
  speakers: Map<string, SpeakerInfo>;
  isRecording: boolean;
  languageA: string[];
  languageB: string;
  onRenameSpeaker: (speakerId: string, newLabel: string) => void;
  onReassignSpeaker: (entryId: string, speakerId: string) => void;
}

interface EntryRowProps {
  entry: BilingualEntry;
  showSpeakerHeader: boolean;
  speakerName: string;
  speakerColor: string;
  translationLabel: string;
  // Every speaker (stable between speaker changes, so rows stay memoized):
  // the targets for moving this sentence, and the rename quick picks
  speakerOptions: SpeakerOption[];
  isEditing: boolean;
  onStartEdit: (entryId: string) => void;
  onEndEdit: () => void;
  onRenameSpeaker: (speakerId: string, newLabel: string) => void;
  onReassignSpeaker: (entryId: string, speakerId: string) => void;
}

interface SpeakerNameEditorProps {
  speakerId: string;
  name: string;
  color: string;
  otherSpeakers: SpeakerOption[];
  onRename: (speakerId: string, newLabel: string) => void;
  onClose: () => void;
}

// Inline rename. Picking (or typing) a name another speaker already has
// marks them as the same person — how a name survives stop/start.
function SpeakerNameEditor({
  speakerId,
  name,
  color,
  otherSpeakers,
  onRename,
  onClose,
}: SpeakerNameEditorProps) {
  const t = useT();
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter / Esc unmount the input, which can still fire a blur
  const doneRef = useRef(false);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const finish = (label: string | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (label && label.trim() && label.trim() !== name) onRename(speakerId, label.trim());
    onClose();
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        ref={inputRef}
        autoFocus
        value={value}
        placeholder={t("speaker_name_placeholder")}
        aria-label={t("rename_speaker")}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(value);
          if (e.key === "Escape") finish(null);
        }}
        className="w-40 rounded border border-blue-300 bg-white px-2 py-0.5 text-sm font-semibold focus:outline-none"
        style={{ color }}
      />
      {otherSpeakers.length > 0 && (
        <>
          <span className="text-xs text-muted-foreground">{t("same_person_as")}</span>
          {otherSpeakers.map((s) => (
            <button
              key={s.id}
              type="button"
              // Keep the input focused, so its blur doesn't save first
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => finish(s.name)}
              className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100"
            >
              {s.name}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// Moves just this sentence to another speaker (a diarization slip), unlike
// renaming, which covers everything that speaker said. Faint until the row
// is hovered or the button focused; always shown on touch screens.
function ReassignSentence({
  entryId,
  otherSpeakers,
  onReassign,
}: {
  entryId: string;
  otherSpeakers: SpeakerOption[];
  onReassign: (entryId: string, speakerId: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("reassign_sentence")}
          data-reassign
          className="ml-1 inline-flex size-6 items-center justify-center rounded align-middle text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <UserRoundPen className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-auto min-w-44 max-w-72 p-1">
        <p className="px-2 py-1 text-xs text-muted-foreground">{t("reassign_to")}</p>
        {otherSpeakers.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onReassign(entryId, s.id);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="truncate" style={{ color: s.color }}>
              {s.name}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// Memoized: while recording, only the live (non-final) row and rows whose
// translation just arrived re-render — not the whole transcript.
const EntryRow = memo(function EntryRow({
  entry,
  showSpeakerHeader,
  speakerName,
  speakerColor,
  translationLabel,
  speakerOptions,
  isEditing,
  onStartEdit,
  onEndEdit,
  onRenameSpeaker,
  onReassignSpeaker,
}: EntryRowProps) {
  const t = useT();
  const otherSpeakers = useMemo(
    () => speakerOptions.filter((s) => s.id !== entry.speaker),
    [speakerOptions, entry.speaker]
  );
  return (
    <div className={`group ${showSpeakerHeader ? "mt-4 first:mt-0" : "mt-2"}`}>
      {/* Speaker header (only when speaker changes) */}
      {showSpeakerHeader && (
        <div className="mb-1 flex items-center gap-2">
          {isEditing ? (
            <SpeakerNameEditor
              speakerId={entry.speaker}
              name={speakerName}
              color={speakerColor}
              otherSpeakers={otherSpeakers}
              onRename={onRenameSpeaker}
              onClose={onEndEdit}
            />
          ) : (
            <button
              type="button"
              onClick={() => onStartEdit(entry.id)}
              title={t("rename_speaker")}
              className="text-sm font-semibold hover:opacity-70 transition"
              style={{ color: speakerColor }}
            >
              {speakerName}
            </button>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatTime(entry.startMs)}
          </span>
        </div>
      )}

      {/* Original: language tag + what was said */}
      <div className="leading-relaxed">
        {entry.language && (
          <span className="inline-block mr-1.5 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium align-[1px]">
            {getLanguageLabel(entry.language)}
          </span>
        )}
        {entry.isFinal ? (
          <span
            title={`${formatTime(entry.startMs)}${entry.endMs > 0 ? ` – ${formatTime(entry.endMs)}` : ""}`}
            className="text-foreground rounded cursor-default"
          >
            {entry.originalText}
          </span>
        ) : (
          <>
            {entry.originalText && <span className="text-gray-700">{entry.originalText}</span>}
            {/* Not yet confirmed by the engine: lighter, still readable */}
            {entry.interimOriginal && (
              <span className="text-gray-500">{entry.interimOriginal}</span>
            )}
            <span className="blink-cursor ml-0.5 inline-block h-4 w-0.5 bg-gray-400 align-text-bottom" />
          </>
        )}
        {/* The live sentence's speaker is still the engine's to decide */}
        {entry.isFinal && otherSpeakers.length > 0 && (
          <ReassignSentence
            entryId={entry.id}
            otherSpeakers={otherSpeakers}
            onReassign={onReassignSpeaker}
          />
        )}
      </div>

      {/* Translation: set apart by the indent rule and its language tag, not
          by fading — it has to be as readable as the original. Upright, as
          italics slant Chinese glyphs. A provisional one (still being
          revised) gets a dotted underline instead of a paler color. */}
      {entry.translatedText && (
        <div className="mt-1 border-l-2 border-gray-200 pl-2.5 text-sm leading-relaxed text-gray-700">
          <span className="inline-block mr-1.5 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
            {translationLabel}
          </span>
          <span
            data-translation
            title={entry.translationProvisional ? t("translation_provisional") : undefined}
            className={
              entry.translationProvisional
                ? "underline decoration-dotted decoration-gray-400 underline-offset-4"
                : undefined
            }
          >
            {entry.translatedText}
          </span>
        </div>
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
  onRenameSpeaker,
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

  // Names and colors come from SpeakerInfo — the same source as the
  // speaker panel, so a person looks the same everywhere
  const speakerOptions = useMemo<SpeakerOption[]>(
    () =>
      Array.from(speakers.values(), (s) => ({
        id: s.id,
        name: speakerDisplayName(s.id, s.label, t),
        color: s.color,
      })),
    [speakers, t]
  );

  const showEmpty = entries.length === 0 && !currentInterim;
  const languageAPrimary = languageA[0] === "*" ? "zh" : (languageA[0] ?? "zh");

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-white">
      <div
        ref={containerRef}
        role="log"
        aria-live="polite"
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
                <p className="text-sm text-muted-foreground">{t("listening")}</p>
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

        {/* Entries: one block per sentence, original then translation */}
        {entries.map((entry, i) => {
          const info = speakers.get(entry.speaker);
          return (
            <EntryRow
              key={entry.id}
              entry={entry}
              showSpeakerHeader={i === 0 || entries[i - 1].speaker !== entry.speaker}
              speakerName={speakerDisplayName(entry.speaker, info?.label, t)}
              speakerColor={info?.color ?? FALLBACK_SPEAKER_COLOR}
              // Mirrors the target selection in requestTranslation: text in
              // language B goes to language A, everything else to language B
              translationLabel={getLanguageLabel(
                entry.language === languageB ? languageAPrimary : languageB
              )}
              speakerOptions={speakerOptions}
              isEditing={editingSpeakerEntryId === entry.id}
              onStartEdit={handleStartEdit}
              onEndEdit={handleEndEdit}
              onRenameSpeaker={onRenameSpeaker}
              onReassignSpeaker={onReassignSpeaker}
            />
          );
        })}

        {/* Global interim text (from hook's currentInterim, if any) */}
        {currentInterim && entries.length > 0 && (
          <span className="text-gray-500">
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
          aria-label={t("scroll_to_latest")}
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
