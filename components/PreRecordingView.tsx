"use client";

import { useState } from "react";
import type { SonioxConfig } from "@/types/bilingual";
import { INDUSTRY_PRESETS } from "@/lib/contextTerms";

interface PreRecordingViewProps {
  onStart: (config: SonioxConfig) => void;
  isConnecting: boolean;
}

export default function PreRecordingView({
  onStart,
  isConnecting,
}: PreRecordingViewProps) {
  const [language, setLanguage] = useState<"zh" | "en">("zh");
  const [termsText, setTermsText] = useState("");

  const handleStart = () => {
    const terms = termsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    onStart({ language, contextTerms: terms });
  };

  const appendPresetTerms = (key: string) => {
    const preset = INDUSTRY_PRESETS[key];
    if (!preset) return;
    const current = termsText.trim();
    const joined = preset.terms.join(", ");
    setTermsText(current ? `${current}, ${joined}` : joined);
  };

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8 text-center">
        {/* Microphone icon */}
        <div className="flex justify-center">
          <svg
            className="h-20 w-20 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">双语实时转录</h1>
          <p className="mt-1 text-sm text-gray-500">
            Bilingual Real-time Transcription
          </p>
        </div>

        {/* Language selector */}
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => setLanguage("zh")}
            className={`rounded-lg px-5 py-2 text-sm font-medium transition ${
              language === "zh"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            中文
          </button>
          <button
            type="button"
            onClick={() => setLanguage("en")}
            className={`rounded-lg px-5 py-2 text-sm font-medium transition ${
              language === "en"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            English
          </button>
        </div>

        {/* Context Terms */}
        <div className="space-y-3 text-left">
          <p className="text-sm font-medium text-gray-700">专业术语 Context Terms</p>

          {/* Industry presets */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(INDUSTRY_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => appendPresetTerms(key)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 transition hover:border-blue-300 hover:text-blue-600"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Textarea */}
          <textarea
            value={termsText}
            onChange={(e) => setTermsText(e.target.value)}
            rows={3}
            placeholder="输入专业术语，用逗号分隔 / Enter terms, comma-separated"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <p className="text-xs text-gray-400">
            添加专业术语以提高识别准确率
          </p>
        </div>

        {/* Start button */}
        <button
          type="button"
          onClick={handleStart}
          disabled={isConnecting}
          className="inline-flex items-center gap-2 rounded-full bg-green-600 px-8 py-3 text-base font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isConnecting ? (
            <>
              <svg
                className="h-5 w-5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              连接中...
            </>
          ) : (
            <>
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                />
              </svg>
              Start Recording
            </>
          )}
        </button>
      </div>
    </div>
  );
}
