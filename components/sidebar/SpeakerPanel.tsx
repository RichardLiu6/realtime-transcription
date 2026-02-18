"use client";

import { useState, useRef, useEffect } from "react";
import type { SpeakerInfo } from "@/types/bilingual";

interface SpeakerPanelProps {
  speakers: Map<string, SpeakerInfo>;
  onRenameSpeaker: (speakerId: string, newLabel: string) => void;
}

export default function SpeakerPanel({
  speakers,
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

  return (
    <div className="border-b border-gray-100 px-4 py-3">
      <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
        Speakers ({speakers.size})
      </p>
      <div className="space-y-1.5">
        {speakerList.map((speaker) => (
          <div
            key={speaker.id}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50"
          >
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
                className="flex-1 rounded border border-blue-300 bg-white px-2 py-0.5 text-xs text-gray-700 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => handleStartEdit(speaker)}
                className="flex-1 text-left text-xs text-gray-600 hover:text-blue-600 truncate"
              >
                {speaker.label}
              </button>
            )}
            <span className="text-xs text-gray-400 tabular-nums">
              {speaker.wordCount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
