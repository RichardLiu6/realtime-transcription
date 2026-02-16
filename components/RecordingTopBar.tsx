"use client";

interface RecordingTopBarProps {
  onStop: () => void;
  elapsedSeconds: number;
  termsCount: number;
  onExport: () => void;
}

export default function RecordingTopBar({
  onStop,
  elapsedSeconds,
  termsCount,
  onExport,
}: RecordingTopBarProps) {
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");

  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
      {/* Left: Stop + Timer */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onStop}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 transition hover:bg-red-700"
          aria-label="Stop recording"
        >
          <svg className="h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 16 16">
            <rect x="3" y="3" width="10" height="10" rx="1" />
          </svg>
        </button>
        <span className="font-mono text-lg font-semibold text-gray-800 recording-pulse">
          {minutes}:{seconds}
        </span>
      </div>

      {/* Center: Terms badge */}
      <div>
        {termsCount > 0 && (
          <span className="rounded-full bg-blue-50 px-3 py-0.5 text-xs font-medium text-blue-600">
            {termsCount} terms
          </span>
        )}
      </div>

      {/* Right: Export */}
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
    </div>
  );
}
