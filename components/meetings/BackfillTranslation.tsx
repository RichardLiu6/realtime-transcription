"use client";

import { useRef, useState } from "react";
import { useTermPacks } from "@/lib/useTermPacks";
import { Languages, Loader2, X } from "lucide-react";
import { SONIOX_LANGUAGES } from "@/types/bilingual";
import { getLocale, useLanguageName, useT } from "@/lib/i18n";
import { combineTerms } from "@/lib/contextTerms";
import type { SavedEntry } from "@/lib/meetings/types";

// 补翻译 on a saved meeting (owner only): translate the sentences that lack
// the chosen languages, through the same /api/translate as live meetings
// (model, fallback, terms, usage), a few at a time, saving as it goes. The
// original is never changed; a sentence already in a language isn't
// translated into it (its own column shows the original).

const CONCURRENCY = 4;
const SAVE_EVERY = 10;
const CONTEXT_SENTENCES = 3;
// Offered first; any other language can be added from the list
const COMMON = ["zh", "en", "es", "vi"];

// The terms selected on the recording page (same browser)
function storedTerms(packs: { id: string; terms: string[] }[]): string[] {
  try {
    const read = (key: string): string[] => {
      const v = JSON.parse(localStorage.getItem(key) ?? "[]");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    };
    return combineTerms(read("termPresets"), read("customTerms"), packs);
  } catch {
    return [];
  }
}

export function missingLangs(e: SavedEntry, langs: string[]): string[] {
  return langs.filter((l) => l !== e.language && !e.translations?.[l]);
}

interface Props {
  meetingId: string;
  entries: SavedEntry[];
  // Languages already translated into (preselected)
  existing: string[];
  onTranslated: (entries: SavedEntry[]) => void;
}

export default function BackfillTranslation({ meetingId, entries, existing, onTranslated }: Props) {
  const t = useT();
  const langName = useLanguageName();
  const termPacks = useTermPacks();
  const [open, setOpen] = useState(false);
  const [langs, setLangs] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ done: number; failed: number } | null>(null);
  const stopRef = useRef(false);

  const openPanel = () => {
    const locale = getLocale();
    setLangs(existing.length > 0 ? existing : [COMMON.includes(locale) ? locale : "en"]);
    setResult(null);
    setOpen(true);
  };
  const offered = Array.from(new Set([...COMMON, ...existing, ...langs]));
  const toggle = (l: string) =>
    setLangs((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));

  const todo = entries.filter((e) => e.originalText && missingLangs(e, langs).length > 0);

  const run = async () => {
    const work = todo;
    if (work.length === 0) return;
    stopRef.current = false;
    setResult(null);
    setProgress({ done: 0, total: work.length });
    const terms = storedTerms(termPacks.packs);
    const order = new Map(entries.map((e, i) => [e.id, i]));
    const pending: SavedEntry[] = [];
    let done = 0;
    let failed = 0;
    let accountFailure = false;

    const save = async () => {
      if (pending.length === 0) return;
      const batch = pending.splice(0, pending.length);
      const r = await fetch(`/api/meetings/${meetingId}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: batch }),
      }).catch(() => null);
      if (!r?.ok) {
        // Not saved: count them as failed so a second run picks them up
        failed += batch.length;
        done -= batch.length;
        return;
      }
      onTranslated(batch);
    };

    const translateOne = async (e: SavedEntry) => {
      const targets = missingLangs(e, langs);
      const i = order.get(e.id) ?? 0;
      const context = entries
        .slice(Math.max(0, i - CONTEXT_SENTENCES), i)
        .map((x) => x.originalText)
        .filter(Boolean);
      const r = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: e.originalText,
          sourceLang: e.language,
          targetLangs: targets,
          uiLocale: getLocale(),
          ...(context.length > 0 ? { context } : {}),
          ...(terms.length > 0 ? { terms } : {}),
        }),
      }).catch(() => null);
      if (!r?.ok) {
        // No credits / bad key: every further call would fail the same way
        if (r && (r.status === 401 || r.status === 402)) accountFailure = true;
        failed++;
        return;
      }
      const data = (await r.json().catch(() => ({}))) as { translations?: Record<string, string> };
      const got = Object.fromEntries(
        Object.entries(data.translations ?? {}).filter(([l, text]) => targets.includes(l) && typeof text === "string" && text.trim())
      );
      if (Object.keys(got).length === 0) {
        failed++;
        return;
      }
      pending.push({ ...e, translations: { ...e.translations, ...got }, translationProvisional: undefined });
      done++;
      setProgress({ done: done + failed, total: work.length });
      if (pending.length >= SAVE_EVERY) await save();
    };

    let next = 0;
    const worker = async () => {
      while (next < work.length && !stopRef.current && !accountFailure) {
        const e = work[next++];
        await translateOne(e);
        setProgress({ done: done + failed, total: work.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));
    await save();
    setProgress(null);
    // Failed, unsaved, or not tried (stopped, or the account failed)
    setResult({ done, failed: work.length - done });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPanel}
        data-backfill-open
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm hover:bg-muted"
      >
        <Languages className="size-4" aria-hidden />
        {t("meeting_translate")}
      </button>
    );
  }

  const running = progress !== null;
  return (
    <div className="w-full rounded-md border border-border bg-muted/30 p-3 text-sm" data-backfill>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-gray-700">{t("meeting_translate_hint")}</p>
        {!running && (
          <button type="button" onClick={() => setOpen(false)} aria-label={t("done")} className="text-gray-600 hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={t("meeting_translate")}>
        {offered.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={langs.includes(l)}
            disabled={running}
            data-backfill-lang={l}
            onClick={() => toggle(l)}
            className="rounded-full border border-border px-2.5 py-1 text-xs text-gray-700 hover:bg-muted disabled:opacity-60 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
          >
            {langName(l)}
          </button>
        ))}
        <select
          aria-label={t("meeting_translate_add")}
          value=""
          disabled={running}
          onChange={(ev) => ev.target.value && toggle(ev.target.value)}
          className="h-7 rounded-full border border-border bg-background px-2 text-xs text-gray-700"
        >
          <option value="">+ {t("meeting_translate_add")}</option>
          {SONIOX_LANGUAGES.filter((x) => !offered.includes(x.code)).map((x) => (
            <option key={x.code} value={x.code}>
              {langName(x.code)}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {running ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-700" data-backfill-progress>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t("meeting_translate_progress", { done: progress.done, total: progress.total })}
            </span>
            <button
              type="button"
              onClick={() => (stopRef.current = true)}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              {t("meeting_translate_stop")}
            </button>
          </>
        ) : todo.length > 0 ? (
          <button
            type="button"
            onClick={run}
            data-backfill-start
            className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:bg-foreground/90"
          >
            {t("meeting_translate_start", { count: todo.length })}
          </button>
        ) : (
          langs.length > 0 && <span className="text-xs text-gray-700">{t("meeting_translate_nothing")}</span>
        )}
        {result && !running && (
          <span role="status" className={`text-xs ${result.failed ? "text-red-700" : "text-gray-700"}`} data-backfill-result>
            {result.failed > 0
              ? t("meeting_translate_failed", { count: result.failed })
              : t("meeting_translate_done", { count: result.done })}
          </span>
        )}
      </div>
    </div>
  );
}
