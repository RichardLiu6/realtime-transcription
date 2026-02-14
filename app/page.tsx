"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useVADTranscription } from "@/hooks/useVADTranscription";
import type { TranscriptEntry } from "@/types";
import TranscriptDisplay from "@/components/TranscriptDisplay";

const SPEAKER_OPTIONS = ["发言人 1", "发言人 2", "发言人 3", "发言人 4"];

function formatTime(date: Date) {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
}

function formatSRTTime(date: Date) {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")},${date.getMilliseconds().toString().padStart(3, "0")}`;
}

function formatVTTTime(date: Date) {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}.${date.getMilliseconds().toString().padStart(3, "0")}`;
}

function buildExportText(entries: TranscriptEntry[]) {
  return entries
    .map((e) => {
      const t = e.translations;
      const speakerPrefix = e.speaker ? `[${e.speaker}] ` : "";
      return `${speakerPrefix}[${formatTime(e.timestamp)}]\n  中: ${t.zh}\n  EN: ${t.en}\n  ES: ${t.es}`;
    })
    .join("\n\n");
}

function buildExportSRT(entries: TranscriptEntry[]) {
  return entries
    .map((e, i) => {
      const startTime = e.timestamp;
      const endTime = i + 1 < entries.length ? entries[i + 1].timestamp : new Date(startTime.getTime() + 5000);
      const speakerPrefix = e.speaker ? `[${e.speaker}] ` : "";
      const t = e.translations;
      const lines = [
        `${speakerPrefix}中: ${t.zh}`,
        `${speakerPrefix}EN: ${t.en}`,
        `${speakerPrefix}ES: ${t.es}`,
      ];
      return `${i + 1}\n${formatSRTTime(startTime)} --> ${formatSRTTime(endTime)}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

function buildExportVTT(entries: TranscriptEntry[]) {
  const cues = entries
    .map((e, i) => {
      const startTime = e.timestamp;
      const endTime = i + 1 < entries.length ? entries[i + 1].timestamp : new Date(startTime.getTime() + 5000);
      const speakerPrefix = e.speaker ? `[${e.speaker}] ` : "";
      const t = e.translations;
      const lines = [
        `${speakerPrefix}中: ${t.zh}`,
        `${speakerPrefix}EN: ${t.en}`,
        `${speakerPrefix}ES: ${t.es}`,
      ];
      return `${formatVTTTime(startTime)} --> ${formatVTTTime(endTime)}\n${lines.join("\n")}`;
    })
    .join("\n\n");
  return `WEBVTT\n\n${cues}`;
}

function triggerDownload(entries: TranscriptEntry[], format: "txt" | "srt" | "vtt") {
  if (entries.length === 0) return;

  let content: string;
  let mimeType: string;
  if (format === "srt") {
    content = buildExportSRT(entries);
    mimeType = "text/plain";
  } else if (format === "vtt") {
    content = buildExportVTT(entries);
    mimeType = "text/vtt";
  } else {
    content = buildExportText(entries);
    mimeType = "text/plain";
  }

  const now = new Date();
  const filename = `transcript-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}.${format}`;
  const blob = new Blob([content], { type: mimeType });
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
  const [currentSpeaker, setCurrentSpeaker] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [summary, setSummary] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const speakerRef = useRef(currentSpeaker);

  // Keep ref in sync with state
  useEffect(() => {
    speakerRef.current = currentSpeaker;
  }, [currentSpeaker]);

  const {
    transcripts,
    isRecording,
    isProcessing,
    isLoading,
    errored,
    error,
    start,
    stop,
  } = useVADTranscription(speakerRef);

  // Debounced localStorage backup (500ms)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(() => {
    if (transcripts.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(
        "transcripts-backup",
        JSON.stringify(transcripts.map((t) => ({ ...t, timestamp: t.timestamp.toISOString() })))
      );
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [transcripts]);

  const handleExport = useCallback(
    (format: "txt" | "srt" | "vtt") => {
      triggerDownload(transcripts, format);
      setShowExportMenu(false);
    },
    [transcripts]
  );

  // Close export menu on click outside
  useEffect(() => {
    if (!showExportMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showExportMenu]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stop();
    } else {
      start();
    }
  }, [isRecording, start, stop]);

  const handleSummarize = useCallback(async () => {
    if (transcripts.length === 0) return;
    setIsSummarizing(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcripts: transcripts.map((t) => ({
            text: t.text,
            language: t.language,
            speaker: t.speaker || "",
            timestamp: formatTime(t.timestamp),
          })),
        }),
      });
      const data = await res.json();
      if (data.summary) {
        setSummary(data.summary);
        setShowSummary(true);
      } else {
        setSummary(data.error || "生成摘要失败");
        setShowSummary(true);
      }
    } catch {
      setSummary("生成摘要失败，请重试");
      setShowSummary(true);
    } finally {
      setIsSummarizing(false);
    }
  }, [transcripts]);

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
            aria-label={isRecording ? "暂停录音" : "开始录音"}
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

        {/* Speaker selector chips */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setCurrentSpeaker("")}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
              currentSpeaker === ""
                ? "bg-gray-200 border-gray-300 text-gray-700"
                : "bg-transparent border-gray-200 text-gray-400 hover:border-gray-300"
            }`}
          >
            无
          </button>
          {SPEAKER_OPTIONS.map((speaker) => (
            <button
              key={speaker}
              onClick={() => setCurrentSpeaker(speaker)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                currentSpeaker === speaker
                  ? "bg-gray-200 border-gray-300 text-gray-700"
                  : "bg-transparent border-gray-200 text-gray-400 hover:border-gray-300"
              }`}
            >
              {speaker}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {transcripts.length > 0 && (
            <span className="text-xs text-gray-400">
              {transcripts.length} 条记录
            </span>
          )}
          <button
            onClick={handleSummarize}
            disabled={transcripts.length === 0 || isSummarizing}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
            title="生成会议摘要"
            aria-label="生成会议摘要"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
            </svg>
            {isSummarizing ? "生成中..." : "摘要"}
          </button>
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              disabled={transcripts.length === 0}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
              title="导出转录记录"
              aria-label="导出转录记录"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
              </svg>
              导出
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-sm z-50 py-1 min-w-[80px]">
                {(["txt", "srt", "vtt"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => handleExport(fmt)}
                    className="block w-full text-left px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 cursor-pointer"
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
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

      {/* Summary modal */}
      {showSummary && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="text-sm font-medium text-gray-800">会议摘要</h2>
              <button
                onClick={() => setShowSummary(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
                aria-label="关闭"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm text-gray-700 whitespace-pre-wrap">
              {summary}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
