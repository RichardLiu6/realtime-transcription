"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { BilingualEntry, SpeakerInfo } from "@/types/bilingual";
import { SONIOX_LANGUAGES } from "@/types/bilingual";
import { useT } from "@/lib/i18n";

interface PresentationPanelProps {
  entries: BilingualEntry[];
  currentInterim: string;
  speakers: Map<string, SpeakerInfo>;
  isRecording: boolean;
  targetLangs: string[];
}

function getLangName(code: string): string {
  return SONIOX_LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase();
}

const Cursor = () => (
  <span className="blink-cursor ml-0.5 inline-block h-4 w-0.5 bg-gray-400 align-text-bottom" />
);

// The spoken text in the 原文 column (with the live, unconfirmed tail)
function OriginalText({ entry }: { entry: BilingualEntry }) {
  if (entry.isFinal) return <span>{entry.originalText}</span>;
  return (
    <>
      {entry.originalText && <span className="text-foreground/80">{entry.originalText}</span>}
      {entry.interimOriginal && (
        <span className="text-gray-400 italic">{entry.interimOriginal}</span>
      )}
      <Cursor />
    </>
  );
}

interface RowProps {
  entry: BilingualEntry;
  index: number;
  targetLangs: string[];
}

// Memoized: while someone is speaking only the live row re-renders
const Row = memo(function Row({ entry, index, targetLangs }: RowProps) {
  const t = useT();
  return (
    <tr className="align-top">
      <td className="px-3 py-2 text-muted-foreground">
        <div>{index + 1}</div>
        <span className="mt-1 inline-block px-1.5 py-0.5 bg-gray-100 rounded-full text-[10px] text-gray-500">
          {entry.language?.toUpperCase() || "?"}
        </span>
      </td>
      {/* The transcript is always shown once, whatever the columns */}
      <td className="px-3 py-2 bg-blue-50/40">
        <OriginalText entry={entry} />
      </td>
      {/* Every column is a translation — including the spoken language's,
          which gets a clean version fully in that language */}
      {targetLangs.map((lang) => {
        const text = entry.translations?.[lang];
        return (
          <td key={lang} className="px-3 py-2">
            {text ? (
              <span
                className={
                  entry.translationProvisional ? "text-gray-400 italic" : undefined
                }
              >
                {text}
              </span>
            ) : entry.isFinal ? (
              <span className="text-gray-300 animate-pulse">{t("translating")}</span>
            ) : null}
          </td>
        );
      })}
    </tr>
  );
});

function PresentationPanel({
  entries,
  isRecording,
  targetLangs,
}: PresentationPanelProps) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [entries.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow new text (instant, once per frame — a smooth scroll restarted on
  // every update stutters)
  useEffect(() => {
    if (!isAtBottom) return;
    const el = scrollRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [entries, isAtBottom]);

  // Rows with visible content (live rows appear once text arrives)
  const rows = entries.filter((e) => e.isFinal || e.originalText || e.interimOriginal);

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        {isRecording ? t("listening") : t("presentation_empty")}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background border-b border-border z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">#</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[200px]">
              {t("original_text")}
            </th>
            {targetLangs.map((lang) => (
              <th
                key={lang}
                className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[200px]"
              >
                {getLangName(lang)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((entry, idx) => (
            <Row
              key={entry.id}
              entry={entry}
              index={idx}
              targetLangs={targetLangs}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Memoized so the once-per-second recording timer doesn't re-render the table
export default memo(PresentationPanel);
