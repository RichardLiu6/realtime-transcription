"use client";

import type { TranslationMode } from "@/types/bilingual";

interface TranslationModeToggleProps {
  mode: TranslationMode;
  onChange: (mode: TranslationMode) => void;
  disabled?: boolean;
}

export default function TranslationModeToggle({
  mode,
  onChange,
  disabled,
}: TranslationModeToggleProps) {
  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
        Translation Mode
      </p>
      <div className="flex rounded-lg bg-gray-100 p-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("two_way")}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
            mode === "two_way"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          } disabled:opacity-50`}
        >
          <span className="mr-1">⇄</span>
          双向 Between
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("one_way")}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
            mode === "one_way"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          } disabled:opacity-50`}
        >
          <span className="mr-1">→</span>
          单向 From→To
        </button>
      </div>
      <p className="mt-1.5 text-xs text-gray-400">
        {mode === "two_way"
          ? "自动识别双语对话，适合会议"
          : "固定源语言，翻译到目标语言"}
      </p>
    </div>
  );
}
