"use client";

import { useEffect, useRef, useCallback } from "react";
import { useVADTranscription } from "@/hooks/useVADTranscription";
import type { TranscriptEntry } from "@/types";
import TranscriptDisplay from "@/components/TranscriptDisplay";

function formatTime(date: Date) {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
}

function buildExportText(entries: TranscriptEntry[]) {
  return entries
    .map((e) => `[${formatTime(e.timestamp)}] [${e.language.toUpperCase()}] ${e.text}`)
    .join("\n");
}

function triggerDownload(entries: TranscriptEntry[]) {
  if (entries.length === 0) return;
  const text = buildExportText(entries);
  const now = new Date();
  const filename = `transcript-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}.txt`;
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Home() {
  const {
    transcripts,
    isRecording,
    isProcessing,
    isLoading,
    errored,
    error,
    start,
    stop,
  } = useVADTranscription();

  const transcriptsRef = useRef(transcripts);
  transcriptsRef.current = transcripts;

  // Auto-save to localStorage on each new transcript
  useEffect(() => {
    if (transcripts.length > 0) {
      localStorage.setItem(
        "transcripts-backup",
        JSON.stringify(transcripts.map((t) => ({ ...t, timestamp: t.timestamp.toISOString() })))
      );
    }
  }, [transcripts]);

  // Auto-download on page close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (transcriptsRef.current.length > 0) {
        triggerDownload(transcriptsRef.current);
        localStorage.removeItem("transcripts-backup");
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stop();
    } else {
      start();
    }
  }, [isRecording, start, stop]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top status bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {/* Status indicator - clickable to toggle */}
          <button
            onClick={toggleRecording}
            disabled={isLoading || errored}
            className="flex items-center gap-2 cursor-pointer"
            title={isRecording ? "点击暂停" : "点击开始"}
          >
            <span
              className={`w-3 h-3 rounded-full transition-colors ${
                errored
                  ? "bg-red-500"
                  : isLoading
                  ? "bg-yellow-400 animate-pulse"
                  : isRecording
                  ? "bg-green-500 recording-pulse"
                  : "bg-gray-400"
              }`}
            />
            <span className="text-sm text-gray-600">
              {errored
                ? "加载失败"
                : isLoading
                ? "模型加载中..."
                : isRecording
                ? "录音中"
                : "点击开始"}
            </span>
          </button>

          {isProcessing && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full listening-dot" />
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full listening-dot" />
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full listening-dot" />
              转录中
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {transcripts.length > 0 && (
            <span className="text-xs text-gray-400">
              {transcripts.length} 条记录
            </span>
          )}
          <span className="text-xs text-gray-300">
            关闭页面自动保存
          </span>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="text-center text-sm text-red-500 bg-red-50 px-4 py-2">
          {error}
        </div>
      )}

      {/* Transcript area - fills remaining space */}
      <div className="flex-1 flex flex-col px-4 py-2 max-w-4xl w-full mx-auto">
        <TranscriptDisplay entries={transcripts} isRecording={isRecording} />
      </div>
    </div>
  );
}
