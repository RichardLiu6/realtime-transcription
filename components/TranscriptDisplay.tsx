"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { TranscriptEntry } from "@/types";
import { ALL_LANGS, LANG_LABELS, LANG_BADGES } from "@/types/languages";

interface TranscriptDisplayProps {
  entries: TranscriptEntry[];
  isRecording: boolean;
}

export default function TranscriptDisplay({
  entries,
  isRecording,
}: TranscriptDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Track if user has scrolled away from bottom
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 60;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsAtBottom(atBottom);
  }, []);

  // Auto-scroll to bottom only if user is at the bottom
  useEffect(() => {
    if (isAtBottom && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries.length, isAtBottom]);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
      setIsAtBottom(true);
    }
  }, []);

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  };

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto transcript-scroll p-2 space-y-4"
      >
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-3">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <p className="text-lg">等待语音输入...</p>
            <p className="text-sm">说话自动转录 + 翻译为中/英/西三语</p>
          </div>
        ) : (
          <>
            {entries.map((entry) => (
              <div key={entry.id} className="border-b border-gray-100 pb-3">
                <div className="text-xs text-gray-400 mb-1.5">
                  {formatTime(entry.timestamp)}
                </div>
                <div className="space-y-1">
                  {ALL_LANGS.map((lang) => {
                    const content = entry.translations[lang];
                    if (!content) return null;
                    const isOriginal = lang === entry.language;
                    return (
                      <div key={lang} className="flex items-start gap-2">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${LANG_BADGES[lang]} ${
                            isOriginal ? "font-semibold ring-1 ring-current/20" : "opacity-70"
                          }`}
                        >
                          {LANG_LABELS[lang]}
                        </span>
                        <p
                          className={`flex-1 leading-relaxed text-sm ${
                            isOriginal ? "text-gray-900 font-medium" : "text-gray-500"
                          }`}
                        >
                          {content}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {isRecording && (
              <div className="text-sm text-gray-300 flex items-center gap-1 pl-1">
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full listening-dot" />
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full listening-dot" />
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full listening-dot" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Jump to latest button - appears when user scrolls up */}
      {!isAtBottom && entries.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 bg-gray-800 text-white text-xs px-3 py-1.5 rounded-full shadow-lg hover:bg-gray-700 transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          最新
        </button>
      )}
    </div>
  );
}
