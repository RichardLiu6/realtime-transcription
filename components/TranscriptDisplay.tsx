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

  // Auto-scroll to bottom when new entries are added
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
      className="flex-1 overflow-y-auto rounded-lg border bg-white p-4 space-y-3"
    >
      {entries.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400 text-center">
          点击录音按钮开始语音转文字...
        </div>
      ) : (
        <>
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3">
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {formatTime(entry.timestamp)}
              </span>
              <span
                className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${getLanguageBadgeClass(
                  entry.language
                )}`}
              >
                {entry.language.toUpperCase()}
              </span>
              <p className="text-gray-800 flex-1">{entry.text}</p>
            </div>
          ))}
          {isRecording && entries.length > 0 && (
            <div className="text-sm text-gray-400 italic">
              正在聆听<span className="animate-pulse">...</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
