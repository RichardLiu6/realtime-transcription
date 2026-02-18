"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { ChevronDown, Mic } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import type { BilingualEntry, SpeakerInfo } from "@/types/bilingual";
import { SONIOX_LANGUAGES } from "@/types/bilingual";

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

function getLanguageName(code: string): string {
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code
    );
  } catch {
    return SONIOX_LANGUAGES.find((l) => l.code === code)?.name || code;
  }
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

export default function TranscriptPanel({
  entries,
  currentInterim,
  speakers,
  isRecording,
  languageA,
  languageB,
  onReassignSpeaker,
}: TranscriptPanelProps) {
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

  useEffect(() => {
    if (isAtBottom) scrollToBottom();
  }, [entries, currentInterim, isAtBottom, scrollToBottom]);

  const showEmpty = entries.length === 0 && !currentInterim;

  // Track previous speaker for header display logic
  let prevSpeaker: string | null = null;

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
                <p className="text-sm text-gray-400">Listening...</p>
              </div>
            ) : (
              <div className="text-center text-muted-foreground/40">
                <Mic className="mx-auto size-16" strokeWidth={1} />
                <p className="mt-2 text-sm">
                  Click Start Recording in the sidebar
                </p>
              </div>
            )}
          </div>
        )}

        {/* Entries: Soniox Compare style - single column, flowing text */}
        {entries.map((entry) => {
          const speakerNum = Number(entry.speaker) || 1;
          const speakerColor = getSpeakerColor(speakerNum);
          const speakerInfo = speakers.get(entry.speaker);
          const speakerName =
            speakerInfo?.label || `Speaker ${entry.speaker}`;
          const isEditing = editingSpeakerEntryId === entry.id;

          // Show speaker header when speaker changes
          const showSpeakerHeader = entry.speaker !== prevSpeaker;

          const elements: React.ReactNode[] = [];

          // Speaker header
          if (showSpeakerHeader) {
            elements.push(
              <div
                key={`${entry.id}-speaker`}
                className="mt-4 first:mt-0 mb-1 flex items-center gap-2"
              >
                {isEditing ? (
                  <select
                    autoFocus
                    value={entry.speaker}
                    onChange={(e) => {
                      onReassignSpeaker(entry.id, e.target.value);
                      setEditingSpeakerEntryId(null);
                    }}
                    onBlur={() => setEditingSpeakerEntryId(null)}
                    className="rounded border border-blue-300 bg-white px-2 py-0.5 text-sm font-semibold focus:outline-none"
                    style={{ color: speakerColor }}
                  >
                    {Array.from(speakers.values()).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingSpeakerEntryId(entry.id)}
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
            );
          }

          // Language badge — always show per entry when language is known
          if (entry.language) {
            elements.push(
              <span
                key={`${entry.id}-lang`}
                className="inline-block mr-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium"
              >
                {getLanguageName(entry.language)}
              </span>
            );
          }

          // Original text
          if (entry.isFinal) {
            // Final: normal styling with tooltip showing timing
            elements.push(
              <Tooltip key={`${entry.id}-original`}>
                <TooltipTrigger asChild>
                  <span className="text-foreground leading-relaxed hover:text-primary rounded cursor-default transition-colors">
                    {entry.originalText}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <p>Start: {formatTime(entry.startMs)}</p>
                  {entry.endMs > 0 && <p>End: {formatTime(entry.endMs)}</p>}
                </TooltipContent>
              </Tooltip>
            );
          } else {
            // Non-final (streaming): show final tokens + interim tokens with cursor
            elements.push(
              <React.Fragment key={`${entry.id}-original`}>
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
              </React.Fragment>
            );
          }

          // Translation text (smaller, italic, muted - below original)
          if (entry.translatedText) {
            elements.push(
              <React.Fragment key={`${entry.id}-translation`}>
                <br />
                <span className="inline-block mr-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                  {getLanguageName(
                    languageA.includes("*") || languageA.includes(entry.language)
                      ? languageB
                      : languageA[0]
                  )}
                </span>
                <span className="text-sm italic text-gray-400 leading-relaxed">
                  {entry.translatedText}
                  {entry.interimTranslated && (
                    <span className="text-gray-300">
                      {entry.interimTranslated}
                    </span>
                  )}
                </span>
                <div className="h-2" />
              </React.Fragment>
            );
          }

          prevSpeaker = entry.speaker;

          return (
            <div key={entry.id} className="inline">
              {elements}
            </div>
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
