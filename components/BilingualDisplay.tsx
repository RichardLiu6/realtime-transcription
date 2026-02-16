"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { BilingualEntry, SpeakerInfo } from "@/types/bilingual";

interface BilingualDisplayProps {
  entries: BilingualEntry[];
  speakers: Map<number, SpeakerInfo>;
  isRecording: boolean;
}

export default function BilingualDisplay({
  entries,
  speakers,
  isRecording,
}: BilingualDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // Track scroll position
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

  // Auto-scroll when new entries arrive and user is at bottom
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [entries, isAtBottom, scrollToBottom]);

  // Empty state: recording but no entries
  if (entries.length === 0 && isRecording) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mb-3 flex justify-center gap-2">
            <span className="listening-dot inline-block h-3 w-3 rounded-full bg-blue-500" />
            <span className="listening-dot inline-block h-3 w-3 rounded-full bg-blue-500" />
            <span className="listening-dot inline-block h-3 w-3 rounded-full bg-blue-500" />
          </div>
          <p className="text-sm text-gray-400">正在聆听...</p>
        </div>
      </div>
    );
  }

  // Empty state: not recording, no entries
  if (entries.length === 0 && !isRecording) {
    return (
      <div className="flex flex-1 items-center justify-center">
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
          <p className="mt-2 text-sm">点击上方开始录音</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Landscape hint for portrait */}
      <p className="block bg-blue-50 px-3 py-1 text-center text-xs text-blue-500 landscape:hidden">
        推荐横屏使用
      </p>

      <div
        ref={containerRef}
        className="transcript-scroll flex-1 overflow-y-auto px-4 py-3"
      >
        <div className="grid grid-cols-1 gap-3 landscape:grid-cols-2 md:grid-cols-2">
          {/* Column headers */}
          <div className="hidden text-xs font-medium uppercase tracking-wide text-gray-400 landscape:block md:block">
            中文
          </div>
          <div className="hidden text-xs font-medium uppercase tracking-wide text-gray-400 landscape:block md:block">
            English
          </div>

          {entries.map((entry) => {
            const speaker = speakers.get(entry.speaker);
            const dotColor = speaker?.color || "bg-gray-400";

            // Determine Chinese and English texts
            const isZh = entry.language === "zh";
            const zhText = isZh ? entry.originalText : entry.translatedText;
            const enText = isZh ? entry.translatedText : entry.originalText;
            const zhIsOriginal = isZh;
            const enIsOriginal = !isZh;

            // Interim text
            const interimZh = isZh
              ? entry.interimOriginal
              : entry.interimTranslated;
            const interimEn = isZh
              ? entry.interimTranslated
              : entry.interimOriginal;

            return (
              <div
                key={entry.id}
                className="col-span-1 grid grid-cols-1 gap-x-4 gap-y-1 border-b border-gray-100 py-2 landscape:col-span-2 landscape:grid-cols-2 md:col-span-2 md:grid-cols-2"
              >
                {/* Chinese column */}
                <div>
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${dotColor}`}
                    />
                    <span className="text-xs text-gray-400">
                      {speaker?.label || `Speaker ${entry.speaker}`}
                    </span>
                  </div>
                  {zhText && (
                    <p
                      className={
                        zhIsOriginal
                          ? "text-sm text-gray-900"
                          : "text-sm text-gray-400"
                      }
                    >
                      {zhText}
                    </p>
                  )}
                  {!entry.isFinal && interimZh && (
                    <p className="text-sm text-gray-400">
                      {interimZh}
                      <span className="blink-cursor ml-0.5 inline-block h-4 w-0.5 bg-gray-400 align-text-bottom" />
                    </p>
                  )}
                </div>

                {/* English column */}
                <div>
                  <div className="mb-0.5 flex items-center gap-1.5 landscape:hidden md:hidden">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${dotColor}`}
                    />
                    <span className="text-xs text-gray-400">
                      {speaker?.label || `Speaker ${entry.speaker}`}
                    </span>
                  </div>
                  {enText && (
                    <p
                      className={
                        enIsOriginal
                          ? "text-sm text-gray-900"
                          : "text-sm text-gray-400"
                      }
                    >
                      {enText}
                    </p>
                  )}
                  {!entry.isFinal && interimEn && (
                    <p className="text-sm text-gray-400">
                      {interimEn}
                      <span className="blink-cursor ml-0.5 inline-block h-4 w-0.5 bg-gray-400 align-text-bottom" />
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
