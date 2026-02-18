"use client";

interface StatusBarProps {
  recordingState: "idle" | "connecting" | "recording";
  elapsedSeconds: number;
  error: string | null;
  onToggleSidebar: () => void;
}

export default function StatusBar({
  recordingState,
  elapsedSeconds,
  error,
  onToggleSidebar,
}: StatusBarProps) {
  const isRecording = recordingState === "recording";
  const isConnecting = recordingState === "connecting";
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");

  return (
    <div className="shrink-0">
      {/* Error banner */}
      {error && (
        <div className="bg-red-50 px-4 py-2 text-center text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        {/* Left: hamburger (mobile only) + status */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={onToggleSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 lg:hidden"
            aria-label="Open sidebar"
          >
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
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
          </button>

          {isRecording && (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500 recording-pulse" />
              <span className="font-mono text-sm font-semibold text-gray-800">
                {minutes}:{seconds}
              </span>
            </div>
          )}

          {isConnecting && (
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin text-gray-400"
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
              <span className="text-sm text-gray-400">Connecting...</span>
            </div>
          )}
        </div>

        {/* Right: branding on mobile */}
        <span className="text-xs text-gray-400 lg:hidden">
          Soniox Bilingual
        </span>
      </div>
    </div>
  );
}
