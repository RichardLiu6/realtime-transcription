"use client";

import { useEffect, useRef } from "react";
import type { BilingualEntry, SpeakerInfo } from "@/types/bilingual";
import { SONIOX_LANGUAGES } from "@/types/bilingual";

interface PresentationPanelProps {
  entries: BilingualEntry[];
  currentInterim: string;
  speakers: Map<string, SpeakerInfo>;
  isRecording: boolean;
  targetLangs: string[];
}

function getLangName(code: string): string {
  return SONIOX_LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase();
}

export default function PresentationPanel({
  entries,
  currentInterim,
  isRecording,
  targetLangs,
}: PresentationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [entries]);

  const finalEntries = entries.filter((e) => e.isFinal);

  if (finalEntries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        {isRecording ? "聆听中..." : "选择目标语言并开始录音"}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background border-b border-border z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">#</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[200px]">
              原文
            </th>
            {targetLangs.map((lang) => (
              <th
                key={lang}
                className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[200px]"
              >
                {getLangName(lang)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {finalEntries.map((entry, idx) => (
            <tr key={entry.id} className="align-top">
              <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
              <td className="px-3 py-2">
                <span className="inline-block mr-1 px-1.5 py-0.5 bg-gray-100 rounded-full text-xs text-gray-500">
                  {entry.language?.toUpperCase() || "?"}
                </span>
                <span>{entry.originalText}</span>
              </td>
              {targetLangs.map((lang) => {
                const text = entry.translations?.[lang];
                return (
                  <td key={lang} className="px-3 py-2">
                    {text ? (
                      <span>{text}</span>
                    ) : (
                      <span className="text-gray-300 animate-pulse">翻译中...</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Interim text */}
      {currentInterim && (
        <div className="px-3 py-2 text-gray-400 italic text-sm">
          {currentInterim}
          <span className="ml-0.5 inline-block h-4 w-0.5 bg-gray-400 align-text-bottom animate-pulse" />
        </div>
      )}
    </div>
  );
}
