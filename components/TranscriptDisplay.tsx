"use client";

import { useEffect, useRef } from "react";
import { TranscriptEntry } from "@/types";

interface TranscriptDisplayProps {
  entries: TranscriptEntry[];
  isRecording: boolean;
}

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

  const getLanguageBadgeClass = (language: string) => {
    const lang = language.toLowerCase();
    if (lang === "zh" || lang === "chinese") {
      return "bg-blue-100 text-blue-700";
    } else if (lang === "en" || lang === "english") {
      return "bg-green-100 text-green-700";
    } else if (lang === "es" || lang === "spanish") {
      return "bg-orange-100 text-orange-700";
    } else {
      return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto transcript-scroll p-2 space-y-3"
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
          <p className="text-sm">开始说话即可自动转录</p>
        </div>
      ) : (
        <>
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3">
              <span className="text-xs text-gray-400 whitespace-nowrap pt-0.5">
                {formatTime(entry.timestamp)}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${getLanguageBadgeClass(
                  entry.language
                )}`}
              >
                {entry.language.toUpperCase()}
              </span>
              <p className="text-gray-800 flex-1 leading-relaxed">{entry.text}</p>
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
