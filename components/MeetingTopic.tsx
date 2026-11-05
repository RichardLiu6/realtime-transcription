"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAiTermsAllowed } from "@/lib/useAiTerms";
import { useMeetingTopic } from "@/lib/useMeetingTopic";
import { MAX_TOPIC } from "@/lib/termPackTypes";

// The meeting's topic: what the meeting is about, the first thing set for
// it (the terms are its details, below it). Picked from the selected packs'
// topics or recent ones, typed, or written by AI from a few words (✦ in the
// field; accounts allowed AI terms). The speech engine and the translation
// get it when a recording starts. `label`: the caller already titles it.
export default function MeetingTopic({
  packTopics,
  meetingLanguages,
  phone = false,
  label = true,
}: {
  packTopics: string[];
  meetingLanguages: string[];
  phone?: boolean;
  label?: boolean;
}) {
  const t = useT();
  const aiAllowed = useAiTermsAllowed() && meetingLanguages.length > 0;
  const { topic, setTopic, recent } = useMeetingTopic();
  const [state, setState] = useState<"idle" | "loading" | "failed" | "limit">("idle");
  // The desktop panel and the phone sheet can both be mounted
  const inputId = useId();
  const field = useRef<HTMLTextAreaElement>(null);

  // As tall as its text (one line when short): on every change, and when
  // its width or the font changes (a sidebar opening, the web font loading)
  const fit = () => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [topic]);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(el);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, []);

  const picks = Array.from(new Set([...packTopics, ...recent])).filter((x) => x && x !== topic.trim()).slice(0, 6);
  const fromPacks = new Set(packTopics);

  const write = async () => {
    const description = topic.trim();
    if (!description || state === "loading") return;
    setState("loading");
    const r = await fetch("/api/terms/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "topic", description, languages: meetingLanguages.slice(0, 5) }),
    }).catch(() => null);
    if (r?.status === 429) return setState("limit");
    const data = r?.ok ? ((await r.json().catch(() => ({}))) as { topic?: string }) : {};
    if (!data.topic) return setState("failed");
    setTopic(data.topic);
    setState("idle");
  };

  const text = phone ? "text-[15px]" : "text-sm";
  const small = phone ? "text-xs" : "text-[11px]";
  return (
    <div data-meeting-topic>
      {label && (
        <label htmlFor={inputId} className={`mb-1 block font-semibold text-foreground ${phone ? "text-base" : "text-xs"}`}>
          {t("meeting_topic")}
        </label>
      )}
      <div className="relative">
        <textarea
          ref={field}
          id={inputId}
          data-topic-input
          aria-label={label ? undefined : t("meeting_topic")}
          rows={1}
          maxLength={MAX_TOPIC}
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value.replace(/\n/g, " "));
            if (state !== "loading") setState("idle");
          }}
          placeholder={t("meeting_topic_placeholder")}
          className={`block w-full resize-none overflow-hidden rounded-md border border-border bg-background py-1.5 pl-2.5 ${
            aiAllowed ? "pr-14" : "pr-8"
          } ${text} leading-snug text-foreground placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-ring`}
        />
        <div className="absolute right-1 top-1 flex items-center">
          {aiAllowed && (
            <button
              type="button"
              onClick={write}
              disabled={!topic.trim() || state === "loading"}
              data-topic-ai
              aria-label={t("meeting_topic_ai")}
              title={t("meeting_topic_ai")}
              className="grid size-6 place-items-center rounded text-blue-700 hover:bg-muted disabled:text-gray-400"
            >
              {state === "loading" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
            </button>
          )}
          {topic && (
            <button
              type="button"
              onClick={() => setTopic("")}
              aria-label={t("meeting_topic_clear")}
              title={t("meeting_topic_clear")}
              className="grid size-6 place-items-center rounded text-gray-500 hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {(state === "failed" || state === "limit") && (
        <p role="alert" className={`mt-1 ${small} text-red-700`}>
          {t(state === "limit" ? "meeting_topic_limit" : "meeting_topic_failed")}
        </p>
      )}
      {picks.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label={t("meeting_topic")}>
          {picks.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setTopic(p)}
              title={`${fromPacks.has(p) ? t("meeting_topic_packs") : t("meeting_topic_recent")}: ${p}`}
              data-topic-pick
              className={`max-w-full truncate rounded-full border border-border px-2 py-0.5 ${small} text-gray-700 hover:bg-muted`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      <p className={`mt-1.5 ${small} leading-snug text-gray-600`}>{t("meeting_topic_hint_short")}</p>
    </div>
  );
}
