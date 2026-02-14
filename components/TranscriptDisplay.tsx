"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  CSSProperties,
} from "react";
import { List, useListRef } from "react-window";
import type { Paragraph } from "@/types";
import { ALL_LANGS, LANG_LABELS, LANG_BADGES } from "@/types/languages";

interface TranscriptDisplayProps {
  entries: Paragraph[];
  isRecording: boolean;
}

const ESTIMATED_ROW_HEIGHT = 140;
const LISTENING_DOTS_HEIGHT = 32;

const formatTime = (date: Date) => {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

const SPEAKER_COLORS: Record<number, string> = {
  0: "bg-indigo-100 text-indigo-700",
  1: "bg-pink-100 text-pink-700",
  2: "bg-teal-100 text-teal-700",
  3: "bg-amber-100 text-amber-700",
  4: "bg-purple-100 text-purple-700",
  5: "bg-cyan-100 text-cyan-700",
};

const SPEAKER_LABELS = ["A", "B", "C", "D", "E", "F"];

interface RowData {
  entries: Paragraph[];
  isRecording: boolean;
  totalRows: number;
}

function RowComponent({
  index,
  style,
  entries,
  isRecording,
  totalRows,
}: {
  ariaAttributes: {
    "aria-posinset": number;
    "aria-setsize": number;
    role: "listitem";
  };
  index: number;
  style: CSSProperties;
} & RowData) {
  const isListeningRow = index === totalRows - 1 && isRecording && index >= entries.length;

  if (isListeningRow) {
    return (
      <div style={style}>
        <div className="px-2 pt-1 pb-2">
          <div className="text-sm text-gray-300 flex items-center gap-1 pl-1">
            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full listening-dot" />
            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full listening-dot" />
            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full listening-dot" />
          </div>
        </div>
      </div>
    );
  }

  const entry = entries[index];
  if (!entry) return null;

  const displayText = entry.text + (entry.interimText ? (entry.text ? " " : "") + entry.interimText : "");
  const hasTranslations = ALL_LANGS.some((l) => entry.translations[l]);
  const speakerLabel = SPEAKER_LABELS[entry.speaker] || String(entry.speaker);
  const speakerColor = SPEAKER_COLORS[entry.speaker] || "bg-gray-100 text-gray-600";

  return (
    <div style={style}>
      <div className="px-2 pt-1.5 pb-3 border-b border-gray-100">
        {/* Header: speaker + time */}
        <div className="text-xs text-gray-400 mb-1 flex items-center gap-1.5">
          <span
            className={`px-1.5 py-0.5 rounded text-xs font-medium ${speakerColor}`}
          >
            Speaker {speakerLabel}
          </span>
          {formatTime(entry.startTime)}
        </div>

        {/* Original text — prominent */}
        <p className="text-sm text-gray-900 leading-relaxed">
          {displayText || (
            <span className="text-gray-300 italic">...</span>
          )}
          {entry.interimText && (
            <span className="inline-block w-0.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </p>

        {/* Translations — compact */}
        {hasTranslations && (
          <div className="mt-1.5 space-y-0.5">
            {ALL_LANGS.map((lang) => {
              const content = entry.translations[lang];
              if (!content) return null;
              return (
                <div key={lang} className="flex items-start gap-1.5">
                  <span
                    className={`text-[10px] px-1 py-px rounded shrink-0 mt-0.5 ${LANG_BADGES[lang]} opacity-80`}
                  >
                    {LANG_LABELS[lang]}
                  </span>
                  <p className="flex-1 leading-snug text-xs text-gray-500">
                    {content}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Translating indicator */}
        {entry.isTranslating && (
          <div className="mt-1 text-xs text-gray-300 flex items-center gap-1">
            <span className="w-1 h-1 bg-blue-300 rounded-full animate-pulse" />
            翻译中...
          </div>
        )}
      </div>
    </div>
  );
}

export default function TranscriptDisplay({
  entries,
  isRecording,
}: TranscriptDisplayProps) {
  const listRef = useListRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const prevEntryCountRef = useRef(0);

  const totalRows = entries.length + (isRecording && entries.length === 0 ? 1 : 0);

  const rowProps: RowData = useMemo(
    () => ({ entries, isRecording, totalRows }),
    [entries, isRecording, totalRows]
  );

  const getRowHeight = useCallback(
    (index: number) => {
      if (index >= entries.length && isRecording) {
        return LISTENING_DOTS_HEIGHT;
      }
      return ESTIMATED_ROW_HEIGHT;
    },
    [entries.length, isRecording]
  );

  const handleScroll = useCallback(() => {
    const el = listRef.current?.element;
    if (!el) return;
    const threshold = 60;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
  }, [listRef]);

  useEffect(() => {
    const el = listRef.current?.element;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [listRef, handleScroll, totalRows]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (totalRows === 0) return;
    const entryCountChanged = entries.length !== prevEntryCountRef.current;
    prevEntryCountRef.current = entries.length;

    if (
      isAtBottomRef.current &&
      listRef.current &&
      (entryCountChanged || isRecording)
    ) {
      requestAnimationFrame(() => {
        try {
          listRef.current?.scrollToRow({
            index: totalRows - 1,
            align: "end",
          });
        } catch {
          // index may be out of range briefly
        }
      });
    }
  }, [entries.length, totalRows, isRecording, listRef]);

  const scrollToBottom = useCallback(() => {
    if (listRef.current && totalRows > 0) {
      try {
        listRef.current.scrollToRow({
          index: totalRows - 1,
          align: "end",
          behavior: "smooth",
        });
      } catch {
        // ignore
      }
      isAtBottomRef.current = true;
      setIsAtBottom(true);
    }
  }, [totalRows, listRef]);

  return (
    <div className="relative flex-1 min-h-0">
      {entries.length === 0 && !isRecording ? (
        <div
          role="log"
          aria-live="polite"
          aria-label="转录记录"
          className="absolute inset-0 overflow-y-auto transcript-scroll p-2"
        >
          <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-3">
            <svg
              className="w-16 h-16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              viewBox="0 0 24 24"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <p className="text-lg">等待语音输入...</p>
            <p className="text-sm">
              Deepgram 实时转录 + 自动识别说话人 + 三语翻译
            </p>
          </div>
        </div>
      ) : (
        <div
          role="log"
          aria-live="polite"
          aria-label="转录记录"
          className="absolute inset-0"
        >
          <List
            listRef={listRef}
            rowComponent={RowComponent}
            rowCount={totalRows}
            rowHeight={getRowHeight}
            rowProps={rowProps}
            overscanCount={5}
            className="transcript-scroll"
            style={{ height: "100%", width: "100%" }}
          />
        </div>
      )}

      {/* Jump to latest */}
      {!isAtBottom && entries.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 bg-gray-800 text-white text-xs px-3 py-1.5 rounded-full shadow-lg hover:bg-gray-700 transition-colors flex items-center gap-1"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          最新
        </button>
      )}
    </div>
  );
}
