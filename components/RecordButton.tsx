"use client";

interface RecordButtonProps {
  isRecording: boolean;
  isLoading: boolean;
  onStart: () => void;
  onStop: () => void;
}

export default function RecordButton({
  isRecording,
  isLoading,
  onStart,
  onStop,
}: RecordButtonProps) {
  const handleClick = () => {
    if (isRecording) {
      onStop();
    } else {
      onStart();
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
          isLoading
            ? "bg-gray-400 opacity-50 cursor-not-allowed"
            : isRecording
            ? "bg-red-500 hover:bg-red-600 animate-pulse"
            : "bg-gray-500 hover:bg-gray-600"
        }`}
        style={{ minWidth: "48px", minHeight: "48px" }}
      >
        {isRecording ? (
          // Stop icon (white square)
          <svg
            className="w-8 h-8 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <rect x="6" y="6" width="12" height="12" />
          </svg>
        ) : (
          // Microphone icon
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>

      <p className="text-sm text-gray-600">
        {isLoading
          ? "加载中..."
          : isRecording
          ? "停止录音"
          : "开始录音"}
      </p>
    </div>
  );
}
