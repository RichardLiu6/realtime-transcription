"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useDeepgramTranscription } from "@/hooks/useDeepgramTranscription";
import type { Paragraph } from "@/types";
import { LANG_LABELS } from "@/types/languages";
import TranscriptDisplay from "@/components/TranscriptDisplay";

const LANGUAGE_OPTIONS = [
  { code: "zh", label: "中文" },
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "multi", label: "多语" },
];

interface SummaryEntry {
  id: string;
  text: string;
  createdAt: string;
  paragraphCount: number;
}

function formatTime(date: Date) {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
}

function formatSRTTime(date: Date) {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")},${date.getMilliseconds().toString().padStart(3, "0")}`;
}

function formatVTTTime(date: Date) {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}.${date.getMilliseconds().toString().padStart(3, "0")}`;
}

const SPEAKER_LABELS = ["A", "B", "C", "D", "E", "F"];

function speakerLabel(speaker: number): string {
  return `Speaker ${SPEAKER_LABELS[speaker] || speaker}`;
}

function buildExportText(entries: Paragraph[]) {
  return entries
    .filter((e) => e.text.trim())
    .map((e) => {
      const t = e.translations;
      const sp = speakerLabel(e.speaker);
      return `[${sp}] [${formatTime(e.startTime)}]\n  ${e.text}\n  中: ${t.zh}\n  EN: ${t.en}\n  ES: ${t.es}`;
    })
    .join("\n\n");
}

function buildExportSRT(entries: Paragraph[]) {
  const filtered = entries.filter((e) => e.text.trim());
  return filtered
    .map((e, i) => {
      const startTime = e.startTime;
      const endTime =
        i + 1 < filtered.length
          ? filtered[i + 1].startTime
          : new Date(startTime.getTime() + 5000);
      const sp = speakerLabel(e.speaker);
      const t = e.translations;
      const lines = [
        `[${sp}] 中: ${t.zh}`,
        `EN: ${t.en}`,
        `ES: ${t.es}`,
      ];
      return `${i + 1}\n${formatSRTTime(startTime)} --> ${formatSRTTime(endTime)}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

function buildExportVTT(entries: Paragraph[]) {
  const filtered = entries.filter((e) => e.text.trim());
  const cues = filtered
    .map((e, i) => {
      const startTime = e.startTime;
      const endTime =
        i + 1 < filtered.length
          ? filtered[i + 1].startTime
          : new Date(startTime.getTime() + 5000);
      const sp = speakerLabel(e.speaker);
      const t = e.translations;
      const lines = [
        `[${sp}] 中: ${t.zh}`,
        `EN: ${t.en}`,
        `ES: ${t.es}`,
      ];
      return `${formatVTTTime(startTime)} --> ${formatVTTTime(endTime)}\n${lines.join("\n")}`;
    })
    .join("\n\n");
  return `WEBVTT\n\n${cues}`;
}

function triggerDownload(
  entries: Paragraph[],
  format: "txt" | "srt" | "vtt"
) {
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

// --------------- Load/save summary history from localStorage ---------------
function loadSummaryHistory(): SummaryEntry[] {
  try {
    const raw = localStorage.getItem("summary-history");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSummaryHistory(history: SummaryEntry[]) {
  localStorage.setItem("summary-history", JSON.stringify(history.slice(0, 20)));
}

// =============== Component ===============
export default function Home() {
  const [primaryLang, setPrimaryLang] = useState("zh");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryHistory, setSummaryHistory] = useState<SummaryEntry[]>([]);
  const [activeSummaryIndex, setActiveSummaryIndex] = useState(0);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Load summary history on mount
  useEffect(() => {
    setSummaryHistory(loadSummaryHistory());
  }, []);

  const {
    paragraphs,
    isRecording,
    isConnecting,
    error,
    start,
    stop,
  } = useDeepgramTranscription(primaryLang);

  // Debounced localStorage backup (500ms)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(() => {
    if (paragraphs.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(
        "paragraphs-backup",
        JSON.stringify(
          paragraphs.map((p) => ({
            ...p,
            startTime: p.startTime.toISOString(),
          }))
        )
      );
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [paragraphs]);

  const handleExport = useCallback(
    (format: "txt" | "srt" | "vtt") => {
      triggerDownload(paragraphs, format);
      setShowExportMenu(false);
    },
    [paragraphs]
  );

  // Close export menu on click outside
  useEffect(() => {
    if (!showExportMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(e.target as Node)
      ) {
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

  // --------------- Summary ---------------
  const handleSummaryClick = useCallback(() => {
    if (summaryHistory.length > 0) {
      // Show existing history
      setActiveSummaryIndex(0);
      setShowSummary(true);
    } else if (paragraphs.length > 0) {
      // No history — generate new
      generateSummary();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryHistory.length, paragraphs.length]);

  const generateSummary = useCallback(async () => {
    if (paragraphs.length === 0) return;
    setIsSummarizing(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcripts: paragraphs
            .filter((p) => p.text.trim())
            .map((p) => ({
              text: p.text,
              language: p.language,
              speaker: speakerLabel(p.speaker),
              timestamp: formatTime(p.startTime),
            })),
        }),
      });
      const data = await res.json();
      const text = data.summary || data.error || "生成摘要失败";
      const entry: SummaryEntry = {
        id: crypto.randomUUID(),
        text,
        createdAt: new Date().toISOString(),
        paragraphCount: paragraphs.length,
      };
      const newHistory = [entry, ...summaryHistory];
      setSummaryHistory(newHistory);
      saveSummaryHistory(newHistory);
      setActiveSummaryIndex(0);
      setShowSummary(true);
    } catch {
      const entry: SummaryEntry = {
        id: crypto.randomUUID(),
        text: "生成摘要失败，请重试",
        createdAt: new Date().toISOString(),
        paragraphCount: paragraphs.length,
      };
      const newHistory = [entry, ...summaryHistory];
      setSummaryHistory(newHistory);
      saveSummaryHistory(newHistory);
      setActiveSummaryIndex(0);
      setShowSummary(true);
    } finally {
      setIsSummarizing(false);
    }
  }, [paragraphs, summaryHistory]);

  const activeSummary = summaryHistory[activeSummaryIndex];

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top status bar */}
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleRecording}
            disabled={isConnecting}
            className="flex items-center gap-2 cursor-pointer"
            title={isRecording ? "点击暂停" : "点击开始"}
            aria-label={isRecording ? "暂停录音" : "开始录音"}
          >
            <span
              className={`w-3 h-3 rounded-full transition-colors ${
                isConnecting
                  ? "bg-yellow-400 animate-pulse"
                  : isRecording
                  ? "bg-green-500 recording-pulse"
                  : "bg-gray-400"
              }`}
            />
            <span className="text-sm text-gray-600">
              {isConnecting
                ? "连接中..."
                : isRecording
                ? "录音中"
                : "点击开始"}
            </span>
          </button>
        </div>

        {/* Language selector */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400 mr-1">语言</span>
          {LANGUAGE_OPTIONS.map((opt) => (
            <button
              key={opt.code}
              onClick={() => setPrimaryLang(opt.code)}
              disabled={isRecording}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                primaryLang === opt.code
                  ? "bg-gray-200 border-gray-300 text-gray-700"
                  : "bg-transparent border-gray-200 text-gray-400 hover:border-gray-300"
              } ${isRecording ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {paragraphs.length > 0 && (
            <span className="text-xs text-gray-400">
              {paragraphs.filter((p) => p.text.trim()).length} 段
            </span>
          )}
          <button
            onClick={handleSummaryClick}
            disabled={
              paragraphs.length === 0 && summaryHistory.length === 0 || isSummarizing
            }
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
            title={summaryHistory.length > 0 ? "查看摘要" : "生成会议摘要"}
            aria-label="会议摘要"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5"
            >
              <path
                fillRule="evenodd"
                d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z"
                clipRule="evenodd"
              />
            </svg>
            {isSummarizing
              ? "生成中..."
              : summaryHistory.length > 0
              ? `摘要(${summaryHistory.length})`
              : "摘要"}
          </button>
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              disabled={paragraphs.length === 0}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
              title="导出转录记录"
              aria-label="导出转录记录"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3.5 h-3.5"
              >
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

      {/* Transcript area */}
      <div className="flex-1 min-h-0 flex flex-col px-4 py-2 max-w-4xl w-full mx-auto">
        <TranscriptDisplay entries={paragraphs} isRecording={isRecording} />
      </div>

      {/* Summary modal */}
      {showSummary && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium text-gray-800">
                  会议摘要
                </h2>
                {summaryHistory.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        setActiveSummaryIndex((i) =>
                          Math.min(i + 1, summaryHistory.length - 1)
                        )
                      }
                      disabled={
                        activeSummaryIndex >= summaryHistory.length - 1
                      }
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer text-xs"
                    >
                      &larr;
                    </button>
                    <span className="text-xs text-gray-400">
                      {activeSummaryIndex + 1}/{summaryHistory.length}
                    </span>
                    <button
                      onClick={() =>
                        setActiveSummaryIndex((i) => Math.max(i - 1, 0))
                      }
                      disabled={activeSummaryIndex <= 0}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer text-xs"
                    >
                      &rarr;
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowSummary(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
                aria-label="关闭"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm text-gray-700 whitespace-pre-wrap">
              {activeSummary?.text || "无摘要"}
            </div>
            <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t">
              {activeSummary && (
                <span className="text-xs text-gray-400">
                  {new Date(activeSummary.createdAt).toLocaleString()} ·{" "}
                  {activeSummary.paragraphCount} 段
                </span>
              )}
              <button
                onClick={generateSummary}
                disabled={isSummarizing || paragraphs.length === 0}
                className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-30 cursor-pointer"
              >
                {isSummarizing ? "生成中..." : "重新生成"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
