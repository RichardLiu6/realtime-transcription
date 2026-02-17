"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { BilingualEntry, SpeakerInfo } from "@/types/bilingual";
import { SONIOX_LANGUAGES } from "@/types/bilingual";

interface BilingualDisplayProps {
  entries: BilingualEntry[];
  speakers: Map<string, SpeakerInfo>;
  isRecording: boolean;
  languageA: string;
  languageB: string;
  onLanguageAChange: (code: string) => void;
  onLanguageBChange: (code: string) => void;
  onReassignSpeaker: (entryId: string, newSpeaker: string) => void;
}

export default function BilingualDisplay({
  entries,
  speakers,
  isRecording,
  languageA,
  languageB,
  onLanguageAChange,
  onLanguageBChange,
  onReassignSpeaker,
}: BilingualDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [editingSpeakerEntryId, setEditingSpeakerEntryId] = useState<
    string | null
  >(null);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
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
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [entries, isAtBottom, scrollToBottom]);

  // Empty state content (shown inside the scroll area below headers)
  const emptyContent = entries.length === 0 && (
    <div className="flex flex-1 items-center justify-center py-20">
      {isRecording ? (
        <div className="text-center">
          <div className="mb-3 flex justify-center gap-2">
            <span className="listening-dot inline-block h-3 w-3 rounded-full bg-blue-500" />
            <span className="listening-dot inline-block h-3 w-3 rounded-full bg-blue-500" />
            <span className="listening-dot inline-block h-3 w-3 rounded-full bg-blue-500" />
          </div>
          <p className="text-sm text-gray-400">正在聆听...</p>
        </div>
      ) : (
        <div className="text-center text-gray-300">
          <svg
            className="mx-auto h-16 w-16"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
          <p className="mt-2 text-sm">点击左上角开始录音</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Portrait hint */}
      <div className="portrait-hint">
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 19.5h3m-6.75 2.25h10.5a2.25 2.25 0 002.25-2.25v-15a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 4.5v15a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
        推荐横屏使用
      </div>

      <div
        ref={containerRef}
        className="transcript-scroll flex-1 overflow-y-auto"
      >
        {/* Column headers with language selectors */}
        <div className="bilingual-grid sticky top-0 z-10 border-b-2 border-gray-200 bg-gray-50">
          <div className="px-4 py-1.5">
            <select
              value={languageA}
              onChange={(e) => onLanguageAChange(e.target.value)}
              className="cursor-pointer rounded border-none bg-transparent text-xs font-semibold uppercase tracking-wide text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {SONIOX_LANGUAGES.map((lang) => (
                <option
                  key={lang.code}
                  value={lang.code}
                  disabled={lang.code === languageB}
                >
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
          <div className="px-4 py-1.5">
            <select
              value={languageB}
              onChange={(e) => onLanguageBChange(e.target.value)}
              className="cursor-pointer rounded border-none bg-transparent text-xs font-semibold uppercase tracking-wide text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {SONIOX_LANGUAGES.map((lang) => (
                <option
                  key={lang.code}
                  value={lang.code}
                  disabled={lang.code === languageA}
                >
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Empty state */}
        {emptyContent}

        {/* Entries */}
        {entries.map((entry) => {
          const speaker = speakers.get(entry.speaker);
          const dotColor = speaker?.color || "bg-gray-400";
          const speakerName = speaker?.label || `Speaker ${entry.speaker}`;
          const isEditing = editingSpeakerEntryId === entry.id;

          // Determine which text goes in which column
          const isLangA = entry.language === languageA;
          const textA = isLangA ? entry.originalText : entry.translatedText;
          const textB = isLangA ? entry.translatedText : entry.originalText;
          const textAIsOriginal = isLangA;
          const textBIsOriginal = !isLangA;

          const interimA = isLangA
            ? entry.interimOriginal
            : entry.interimTranslated;
          const interimB = isLangA
            ? entry.interimTranslated
            : entry.interimOriginal;

          const speakerLabel = isEditing ? (
            <select
              autoFocus
              value={entry.speaker}
              onChange={(e) => {
                onReassignSpeaker(entry.id, e.target.value);
                setEditingSpeakerEntryId(null);
              }}
              onBlur={() => setEditingSpeakerEntryId(null)}
              className="rounded border border-blue-300 bg-white px-1 py-0 text-xs text-gray-600 focus:outline-none"
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
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600"
            >
              <span className={`speaker-dot ${dotColor}`} />
              {speakerName}
            </button>
          );

          return (
            <div key={entry.id} className="bilingual-grid bilingual-entry">
              {/* Column A */}
              <div className="px-4">
                <div className="mb-0.5">{speakerLabel}</div>
                {textA && (
                  <p
                    className={
                      textAIsOriginal
                        ? "text-sm text-gray-900"
                        : "text-sm text-gray-400"
                    }
                  >
                    {textA}
                  </p>
                )}
                {!entry.isFinal && interimA && (
                  <p className="text-sm text-gray-400">
                    {interimA}
                    <span className="blink-cursor ml-0.5 inline-block h-4 w-0.5 bg-gray-400 align-text-bottom" />
                  </p>
                )}
              </div>

              {/* Column B */}
              <div className="px-4">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <span className={`speaker-dot ${dotColor}`} />
                  <span className="text-xs text-gray-400">{speakerName}</span>
                </div>
                {textB && (
                  <p
                    className={
                      textBIsOriginal
                        ? "text-sm text-gray-900"
                        : "text-sm text-gray-400"
                    }
                  >
                    {textB}
                  </p>
                )}
                {!entry.isFinal && interimB && (
                  <p className="text-sm text-gray-400">
                    {interimB}
                    <span className="blink-cursor ml-0.5 inline-block h-4 w-0.5 bg-gray-400 align-text-bottom" />
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scroll-to-bottom button */}
      {!isAtBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-medium text-white shadow-lg transition hover:bg-blue-700"
        >
          最新
        </button>
      )}
    </div>
  );
}
