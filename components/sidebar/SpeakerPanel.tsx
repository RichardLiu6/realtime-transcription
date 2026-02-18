"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { SpeakerInfo, BilingualEntry } from "@/types/bilingual";
import { useT } from "@/lib/i18n";

interface SpeakerPanelProps {
  speakers: Map<string, SpeakerInfo>;
  entries: BilingualEntry[];
  onRenameSpeaker: (speakerId: string, newLabel: string) => void;
}

export default function SpeakerPanel({
  speakers,
  entries,
  onRenameSpeaker,
}: SpeakerPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // Compute word counts from entries
  const speakerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (!entry.isFinal || !entry.originalText) continue;
      const text = entry.originalText.trim();
      // CJK: count characters; others: count words
      const isCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(text);
      const count = isCJK
        ? text.replace(/\s/g, "").length
        : text.split(/\s+/).filter(Boolean).length;
      counts.set(entry.speaker, (counts.get(entry.speaker) || 0) + count);
    }
    return counts;
  }, [entries]);

  const totalWords = useMemo(
    () => Array.from(speakerCounts.values()).reduce((a, b) => a + b, 0),
    [speakerCounts]
  );

  const t = useT();

  if (speakers.size === 0) return null;

  const speakerList = Array.from(speakers.values());

  const handleStartEdit = (speaker: SpeakerInfo) => {
    setEditingId(speaker.id);
    setEditValue(speaker.label);
  };

  const handleFinishEdit = () => {
    if (editingId && editValue.trim()) {
      onRenameSpeaker(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  // Map Tailwind bg class to a CSS color for the bar
  const colorMap: Record<string, string> = {
    "bg-indigo-500": "#6366f1",
    "bg-pink-500": "#ec4899",
    "bg-emerald-500": "#10b981",
    "bg-amber-500": "#f59e0b",
    "bg-cyan-500": "#06b6d4",
    "bg-purple-500": "#a855f7",
    "bg-rose-500": "#f43f5e",
    "bg-teal-500": "#14b8a6",
  };

  return (
    <div className="border-b border-border px-4 py-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {t("speakers")} ({speakers.size})
        {totalWords > 0 && (
          <span className="ml-2 normal-case font-normal">
            {totalWords} {t("words")}
          </span>
        )}
      </p>
      <div className="space-y-1.5">
        {speakerList.map((speaker) => {
          const count = speakerCounts.get(speaker.id) || 0;
          const pct = totalWords > 0 ? Math.round((count / totalWords) * 100) : 0;
          const barColor = colorMap[speaker.color] || "#6366f1";

          return (
            <div key={speaker.id} className="space-y-1">
              <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${speaker.color}`}
                />
                {editingId === speaker.id ? (
                  <input
                    ref={inputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleFinishEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleFinishEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 rounded border border-ring bg-background px-2 py-0.5 text-xs text-foreground focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStartEdit(speaker)}
                    className="flex-1 text-left text-xs text-foreground hover:text-primary truncate"
                  >
                    {speaker.label}
                  </button>
                )}
                {totalWords > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {count} ({pct}%)
                  </span>
                )}
              </div>
              {totalWords > 0 && (
                <div className="mx-2 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: barColor }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
