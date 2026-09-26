"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReadyCard from "@/components/ReadyCard";
import { SONIOX_LANGUAGES, type BilingualEntry, type SpeakerInfo } from "@/types/bilingual";
import { useLanguageName, useT } from "@/lib/i18n";
import { useStoredState } from "@/lib/useStoredState";
import { sameText, sentenceIn } from "@/lib/meetingLanguages";
import { FALLBACK_SPEAKER_COLOR, speakerDisplayName } from "@/hooks/useSpeakerManager";

interface PresentationPanelProps {
  entries: BilingualEntry[];
  currentInterim: string;
  speakers: Map<string, SpeakerInfo>;
  isRecording: boolean;
  isConnecting: boolean;
  languageA: string[];
  targetLangs: string[];
  onStart: () => void;
}

// Below this width per column (原文 + one per language, plus the # column)
// the table is unreadable — the audit found the third language cut off at
// 1024px and 1.5 columns on a phone — so it becomes one card per sentence
const MIN_COLUMN_WIDTH = 250;
const INDEX_COLUMN_WIDTH = 72;

// Card view filter: every language, the original only, or one language
const FILTER_ALL = "all";
const FILTER_ORIGINAL = "original";
const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

const Cursor = () => (
  <span className="blink-cursor ml-0.5 inline-block h-4 w-0.5 bg-gray-400 align-text-bottom" />
);

// The spoken text in the 原文 column (with the live, unconfirmed tail)
function OriginalText({ entry }: { entry: BilingualEntry }) {
  if (entry.isFinal) return <span>{entry.originalText}</span>;
  return (
    <>
      {entry.originalText && <span className="text-foreground/80">{entry.originalText}</span>}
      {/* Not yet confirmed by the engine: lighter, still readable */}
      {entry.interimOriginal && <span className="text-gray-500">{entry.interimOriginal}</span>}
      <Cursor />
    </>
  );
}

// One language's text of a sentence. A same-language column that only
// repeats the original is muted and marked "= 原文" rather than shown at
// full weight a second time (still there to read or copy).
function TargetText({ entry, lang, markSame }: { entry: BilingualEntry; lang: string; markSame: boolean }) {
  const t = useT();
  const text = entry.translations?.[lang];
  if (!text) {
    return entry.isFinal ? (
      <span className="text-muted-foreground animate-pulse">{t("translating")}</span>
    ) : null;
  }
  if (markSame && entry.isFinal && sameText(text, entry.originalText)) {
    return (
      <span data-translation data-same-as-original className="text-muted-foreground">
        <span
          title={t("same_as_original_title")}
          className="mr-1.5 inline-block rounded-full border border-gray-300 px-1.5 text-[11px] font-medium leading-4 text-gray-600"
        >
          {t("same_as_original")}
        </span>
        {text}
      </span>
    );
  }
  // Provisional (still being revised): dotted underline, not a paler color
  // or italics — it must stay readable
  return (
    <span
      data-translation
      title={entry.translationProvisional ? t("translation_provisional") : undefined}
      className={
        entry.translationProvisional
          ? "text-gray-700 underline decoration-dotted decoration-gray-400 underline-offset-4"
          : undefined
      }
    >
      {text}
    </span>
  );
}

function LanguageChip({ code }: { code?: string }) {
  return (
    <span className="inline-block rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
      {code?.toUpperCase() || "?"}
    </span>
  );
}

interface RowProps {
  entry: BilingualEntry;
  index: number;
  targetLangs: string[];
  speakerName: string;
  speakerColor: string;
}

// Memoized: while someone is speaking only the live row re-renders
const Row = memo(function Row({ entry, index, targetLangs, speakerName, speakerColor }: RowProps) {
  return (
    <tr className="align-top">
      <td className="px-3 py-2 text-muted-foreground">
        <div>{index + 1}</div>
        {/* Who said it, in their color (same source as the speaker panel) */}
        <div data-speaker className="mt-0.5 break-words text-xs font-medium" style={{ color: speakerColor }}>
          {speakerName}
        </div>
        <div className="mt-1">
          <LanguageChip code={entry.language} />
        </div>
      </td>
      {/* The transcript is always shown once, whatever the columns */}
      <td className="px-3 py-2 bg-blue-50/40">
        <OriginalText entry={entry} />
      </td>
      {/* Every column is a translation — including the spoken language's,
          which gets a clean version fully in that language */}
      {targetLangs.map((lang) => (
        <td key={lang} className="px-3 py-2">
          <TargetText entry={entry} lang={lang} markSame />
        </td>
      ))}
    </tr>
  );
});

interface CardProps extends RowProps {
  filter: string;
}

// Narrow screens: one card per sentence — speaker and original on top, then
// each language with its name. A filter shows just one language.
const Card = memo(function Card({ entry, index, targetLangs, speakerName, speakerColor, filter }: CardProps) {
  const t = useT();
  const langName = useLanguageName();
  const single = filter !== FILTER_ALL && filter !== FILTER_ORIGINAL ? filter : null;
  const text = single ? sentenceIn(entry, single, "presentation", [], "") : null;
  return (
    <article data-card className="px-4 py-3">
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="font-semibold" style={{ color: speakerColor }}>
          {speakerName}
        </span>
        <span className="tabular-nums text-muted-foreground">#{index + 1}</span>
        <LanguageChip code={entry.language} />
      </div>
      {single ? (
        // Just the chosen language: its translation, or the original while
        // a sentence spoken in it is still being translated
        <p className="leading-relaxed">
          {text ? (
            <>
              <span
                data-translation={text.isOriginal ? undefined : ""}
                className={text.provisional ? "underline decoration-dotted decoration-gray-400 underline-offset-4" : undefined}
              >
                {text.text}
              </span>
              {text.interim && <span className="text-gray-500">{text.interim}</span>}
            </>
          ) : entry.isFinal ? (
            <span className="text-muted-foreground animate-pulse">{t("translating")}</span>
          ) : null}
        </p>
      ) : (
        <>
          <p className="rounded bg-blue-50/60 px-2 py-1 leading-relaxed">
            <OriginalText entry={entry} />
          </p>
          {filter === FILTER_ALL &&
            targetLangs.map((lang) => (
              <div key={lang} className="mt-2 border-l-2 border-gray-200 pl-2.5 leading-relaxed">
                <div className="text-xs font-medium text-gray-600">{langName(lang)}</div>
                <TargetText entry={entry} lang={lang} markSame />
              </div>
            ))}
        </>
      )}
    </article>
  );
});

// Short, native language names for the filter buttons ("中文", "English")
function nativeName(code: string): string {
  return SONIOX_LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase();
}

function PresentationPanel({
  entries,
  speakers,
  isRecording,
  isConnecting,
  languageA,
  targetLangs,
  onStart,
}: PresentationPanelProps) {
  const t = useT();
  const langName = useLanguageName();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [width, setWidth] = useState(0);
  const [storedFilter, setFilter] = useStoredState("multiFilter", FILTER_ALL, isString);
  // A language that is no longer a column falls back to everything
  const filter =
    storedFilter === FILTER_ORIGINAL || targetLangs.includes(storedFilter) ? storedFilter : FILTER_ALL;

  // The panel's own width (the sidebar takes part of the window)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const cards = width > 0 && width < (targetLangs.length + 1) * MIN_COLUMN_WIDTH + INDEX_COLUMN_WIDTH;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

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
  }, [entries, isAtBottom, cards, filter]);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  // Rows with visible content (live rows appear once text arrives)
  const rows = entries.filter((e) => e.isFinal || e.originalText || e.interimOriginal);
  const speakerOf = (e: BilingualEntry) => {
    const info = speakers.get(e.speaker);
    return {
      speakerName: speakerDisplayName(e.speaker, info?.label, t),
      speakerColor: info?.color ?? FALLBACK_SPEAKER_COLOR,
    };
  };

  const filterOptions = [
    { value: FILTER_ALL, label: t("filter_all") },
    { value: FILTER_ORIGINAL, label: t("original_text") },
    ...targetLangs.map((lang) => ({ value: lang, label: nativeName(lang) })),
  ];

  return (
    <div ref={rootRef} className="relative flex flex-1 flex-col overflow-hidden">
      {cards && rows.length > 0 && (
        <div
          role="radiogroup"
          aria-label={t("multi_filter")}
          data-multi-filter
          className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-4 py-2"
        >
          <span className="mr-1 shrink-0 text-xs text-gray-600">{t("multi_filter")}</span>
          {filterOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={filter === o.value}
              onClick={() => setFilter(o.value)}
              className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-gray-700 transition-colors hover:bg-muted aria-checked:border-foreground aria-checked:bg-foreground aria-checked:text-background"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollRef} role="log" aria-live="polite" className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex min-h-full items-center justify-center px-4 py-6">
            {isRecording ? (
              <p className="text-sm text-muted-foreground">{t("listening")}</p>
            ) : (
              <ReadyCard
                translationMode="presentation"
                languageA={languageA}
                languageB=""
                targetLangs={targetLangs}
                connecting={isConnecting}
                onStart={onStart}
              />
            )}
          </div>
        ) : cards ? (
          <div className="divide-y divide-border text-sm">
            {rows.map((entry, idx) => (
              <Card
                key={entry.id}
                entry={entry}
                index={idx}
                targetLangs={targetLangs}
                filter={filter}
                {...speakerOf(entry)}
              />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b border-border z-10">
              <tr>
                <th scope="col" className="text-left px-3 py-2 font-medium text-muted-foreground w-24">#</th>
                <th scope="col" className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[200px]">
                  {t("original_text")}
                </th>
                {targetLangs.map((lang) => (
                  <th
                    key={lang}
                    scope="col"
                    className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[200px]"
                  >
                    {langName(lang)}
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
                  {...speakerOf(entry)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Scrolled up to read: a way back to the live sentence */}
      {!isAtBottom && rows.length > 0 && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={scrollToBottom}
          aria-label={t("scroll_to_latest")}
          className="absolute bottom-4 right-4 z-20 rounded-full bg-zinc-500/30 text-white shadow-lg backdrop-blur-sm hover:bg-zinc-600/80 hover:text-white"
        >
          <ChevronDown className="size-4" />
        </Button>
      )}
    </div>
  );
}

// Memoized so the once-per-second recording timer doesn't re-render the table
export default memo(PresentationPanel);
