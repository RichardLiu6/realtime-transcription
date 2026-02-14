"use client";

import { useEffect, useCallback } from "react";
import { useVADTranscription } from "@/hooks/useVADTranscription";
import type { TranscriptEntry } from "@/types";
import TranscriptDisplay from "@/components/TranscriptDisplay";

function formatTime(date: Date) {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
}

function buildExportText(entries: TranscriptEntry[]) {
  return entries
    .map((e) => {
      const t = e.translations;
      return `[${formatTime(e.timestamp)}]\n  中: ${t.zh}\n  EN: ${t.en}\n  ES: ${t.es}`;
    })
    .join("\n\n");
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

  useEffect(() => {
    if (transcripts.length > 0) {
      localStorage.setItem(
        "transcripts-backup",
        JSON.stringify(transcripts.map((t) => ({ ...t, timestamp: t.timestamp.toISOString() })))
      );
    }
  }, [transcripts]);

  const handleExport = useCallback(() => {
    triggerDownload(transcripts);
  }, [transcripts]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stop();
    } else {
      start();
    }
  }, [isRecording, start, stop]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top status bar */}
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
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
          <button
            onClick={handleExport}
            disabled={transcripts.length === 0}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
            title="导出转录记录"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
              <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
            </svg>
            导出
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 text-center text-sm text-red-500 bg-red-50 px-4 py-2">
          {error}
        </div>
      )}

      {/* Transcript area - fixed height, scrollable */}
      <div className="flex-1 min-h-0 flex flex-col px-4 py-2 max-w-4xl w-full mx-auto">
        <TranscriptDisplay entries={transcripts} isRecording={isRecording} />
      </div>
    </div>
  );
}
