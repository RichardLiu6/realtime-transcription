"use client";

import { useState, useRef, useEffect } from "react";
import type { SpeakerInfo } from "@/types/bilingual";

interface SpeakerBarProps {
  speakers: Map<string, SpeakerInfo>;
  onRenameSpeaker: (speakerId: string, newLabel: string) => void;
}

export default function SpeakerBar({
  speakers,
  onRenameSpeaker,
}: SpeakerBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const speakerList = Array.from(speakers.values());
  const totalWords = speakerList.reduce((sum, s) => sum + s.wordCount, 0);

  useEffect(() => {
    if (editingId !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEdit = (speaker: SpeakerInfo) => {
    setEditingId(speaker.id);
    setEditValue(speaker.label);
  };

  const saveEdit = () => {
    if (editingId !== null && editValue.trim()) {
      onRenameSpeaker(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  if (speakerList.length === 0) return null;

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-2">
      <div className="flex flex-wrap gap-3">
        {speakerList.map((speaker) => (
          <div key={speaker.id} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${speaker.color}`}
            />
            {editingId === speaker.id ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                className="w-24 rounded border border-blue-300 px-1 py-0 text-xs focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => startEdit(speaker)}
                className="text-xs text-gray-600 hover:text-blue-600 hover:underline"
              >
                {speaker.label}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex-shrink-0 text-xs text-gray-400">
        {speakerList.length} speakers{totalWords > 0 && <> &middot; {totalWords} words</>}
      </div>
    </div>
  );
}
