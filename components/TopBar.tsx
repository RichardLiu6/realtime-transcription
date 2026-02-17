"use client";

import { useState, useRef, useEffect } from "react";
import { INDUSTRY_PRESETS } from "@/lib/contextTerms";

interface TopBarProps {
  recordingState: "idle" | "connecting" | "recording";
  elapsedSeconds: number;
  termsText: string;
  onTermsTextChange: (text: string) => void;
  onStart: () => void;
  onStop: () => void;
  onExport: () => void;
  onNewMeeting: () => void;
  hasEntries: boolean;
}

export default function TopBar({
  recordingState,
  elapsedSeconds,
  termsText,
  onTermsTextChange,
  onStart,
  onStop,
  onExport,
  onNewMeeting,
  hasEntries,
}: TopBarProps) {
  const [showTerms, setShowTerms] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isRecording = recordingState === "recording";
  const isConnecting = recordingState === "connecting";
  const isIdle = recordingState === "idle";

  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");

  const termsCount = termsText
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean).length;

  // Close popover on outside click
  useEffect(() => {
    if (!showTerms) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setShowTerms(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTerms]);

  const appendPresetTerms = (key: string) => {
    const preset = INDUSTRY_PRESETS[key];
    if (!preset) return;
    const current = termsText.trim();
    const joined = preset.terms.join(", ");
    onTermsTextChange(current ? `${current}, ${joined}` : joined);
  };

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
      {/* Left: Record/Stop + Timer */}
      <div className="flex items-center gap-3">
        {isRecording ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 transition hover:bg-red-700"
            aria-label="Stop recording"
          >
            <svg
              className="h-3.5 w-3.5 text-white"
              fill="currentColor"
              viewBox="0 0 16 16"
            >
              <rect x="3" y="3" width="10" height="10" rx="1" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={isConnecting}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-green-600 transition hover:bg-green-700 disabled:opacity-60"
            aria-label="Start recording"
          >
            {isConnecting ? (
              <svg
                className="h-4 w-4 animate-spin text-white"
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
            ) : (
              <svg
                className="h-4 w-4 text-white"
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
            )}
          </button>
        )}

        {isRecording && (
          <span className="font-mono text-lg font-semibold text-gray-800 recording-pulse">
            {minutes}:{seconds}
          </span>
        )}

        {isIdle && hasEntries && (
          <span className="text-xs text-gray-400">录音已停止</span>
        )}
      </div>

      {/* Right: Terms gear + New Meeting + Export */}
      <div className="flex items-center gap-2">
        {termsCount > 0 && (
          <span className="hidden rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600 sm:inline-block">
            {termsCount} terms
          </span>
        )}

        {/* Terms gear */}
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setShowTerms(!showTerms)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-gray-100 ${
              showTerms ? "bg-gray-100 text-gray-700" : "text-gray-500"
            }`}
            aria-label="Context terms settings"
          >
            <svg
              className="h-[18px] w-[18px]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>

          {showTerms && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
              <p className="mb-2 text-sm font-medium text-gray-700">
                专业术语 Context Terms
              </p>

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

        {/* New meeting */}
        {isIdle && hasEntries && (
          <button
            type="button"
            onClick={onNewMeeting}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50"
          >
            新会议
          </button>
        )}

        {/* Export */}
        {hasEntries && (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            导出
          </button>
        )}
      </div>
    </div>
  );
}
