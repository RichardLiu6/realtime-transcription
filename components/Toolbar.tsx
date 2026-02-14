"use client";

import { useState } from "react";
import { TranscriptEntry } from "@/types";

interface ToolbarProps {
  entries: TranscriptEntry[];
  onClear: () => void;
}

export default function Toolbar({ entries, onClear }: ToolbarProps) {
  const [showCopied, setShowCopied] = useState(false);
  const disabled = entries.length === 0;

  const handleClear = () => {
    if (window.confirm("确定要清空所有转录记录吗？")) {
      onClear();
    }
  };

  const handleCopy = async () => {
    const text = entries
      .map((entry) => {
        const time = formatTime(entry.timestamp);
        return `[${time}] [${entry.language.toUpperCase()}] ${entry.text}`;
      })
      .join("\n");

    await navigator.clipboard.writeText(text);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const handleExport = () => {
    const text = entries
      .map((entry) => {
        const time = formatTime(entry.timestamp);
        return `[${time}] [${entry.language.toUpperCase()}] ${entry.text}`;
      })
      .join("\n");

    const now = new Date();
    const filename = `transcript-${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(
      now.getHours()
    ).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(
      now.getSeconds()
    ).padStart(2, "0")}.txt`;

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  };

  const buttonClass = `px-4 py-2 rounded-lg border flex items-center gap-2 text-sm transition-colors ${
    disabled
      ? "opacity-50 cursor-not-allowed"
      : "hover:bg-gray-50 cursor-pointer"
  }`;

  return (
    <div className="flex gap-2 justify-center">
      <button
        onClick={handleClear}
        disabled={disabled}
        className={buttonClass}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M3 6h18" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
        清空
      </button>

      <button onClick={handleCopy} disabled={disabled} className={buttonClass}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {showCopied ? "已复制!" : "复制"}
      </button>

      <button
        onClick={handleExport}
        disabled={disabled}
        className={buttonClass}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        导出
      </button>
    </div>
  );
}
