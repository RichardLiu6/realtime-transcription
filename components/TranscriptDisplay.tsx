"use client";

import { useEffect, useRef } from "react";
import { TranscriptEntry } from "@/types";

interface TranscriptDisplayProps {
  entries: TranscriptEntry[];
  isRecording: boolean;
}

const LANG_CONFIG: Record<string, { label: string; badge: string; text: string }> = {
  zh: { label: "中", badge: "bg-blue-100 text-blue-700", text: "text-gray-900" },
  en: { label: "EN", badge: "bg-green-100 text-green-700", text: "text-gray-700" },
  es: { label: "ES", badge: "bg-orange-100 text-orange-700", text: "text-gray-700" },
};

const LANG_ORDER = ["zh", "en", "es"] as const;

export default function TranscriptDisplay({
  entries,
  isRecording,
}: TranscriptDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries.length]);

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto transcript-scroll p-2 space-y-4"
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
                {LANG_ORDER.map((lang) => {
                  const config = LANG_CONFIG[lang];
                  const content = entry.translations[lang];
                  if (!content) return null;
                  const isOriginal = lang === entry.language;
                  return (
                    <div key={lang} className="flex items-start gap-2">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${config.badge} ${
                          isOriginal ? "font-semibold ring-1 ring-current/20" : "opacity-70"
                        }`}
                      >
                        {config.label}
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
  );
}
