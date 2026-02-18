"use client";

import { useState } from "react";
import { INDUSTRY_PRESETS } from "@/lib/contextTerms";

interface TermsPanelProps {
  termsText: string;
  onTermsTextChange: (text: string) => void;
  isRecording: boolean;
}

export default function TermsPanel({
  termsText,
  onTermsTextChange,
  isRecording,
}: TermsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const termsCount = termsText
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean).length;

  const appendPresetTerms = (key: string) => {
    const preset = INDUSTRY_PRESETS[key];
    if (!preset) return;
    const current = termsText.trim();
    const joined = preset.terms.join(", ");
    onTermsTextChange(current ? `${current}, ${joined}` : joined);
  };

  return (
    <div className="border-b border-gray-100">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition"
      >
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Context Terms
          {termsCount > 0 && (
            <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 normal-case">
              {termsCount}
            </span>
          )}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-3">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {Object.entries(INDUSTRY_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => appendPresetTerms(key)}
                className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs text-gray-600 transition hover:border-blue-300 hover:text-blue-600"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <textarea
            value={termsText}
            onChange={(e) => onTermsTextChange(e.target.value)}
            rows={3}
            placeholder="输入专业术语，用逗号分隔"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <p className="mt-1.5 text-xs text-gray-400">
            {isRecording ? "下次录音时生效" : "开始录音时生效"}
          </p>
        </div>
      )}
    </div>
  );
}
