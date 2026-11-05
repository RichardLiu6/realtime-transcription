"use client";

import { useId, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAiTermsAllowed } from "@/lib/useAiTerms";
import { useMeetingTopic } from "@/lib/useMeetingTopic";
import { MAX_TOPIC } from "@/lib/termPackTypes";

// The meeting's topic, above the term packs (desktop terms panel, phone
// terms sheet): picked from the selected packs' topics or recent ones, typed,
// or written by AI from a few words (accounts allowed AI terms). The speech
// engine and the translation get it from the next recording on.
export default function MeetingTopic({
  packTopics,
  meetingLanguages,
  phone = false,
}: {
  packTopics: string[];
  meetingLanguages: string[];
  phone?: boolean;
}) {
  const t = useT();
  const aiAllowed = useAiTermsAllowed();
  const { topic, setTopic, recent } = useMeetingTopic();
  const [state, setState] = useState<"idle" | "loading" | "failed" | "limit">("idle");
  // The desktop panel and the phone sheet can both be mounted
  const inputId = useId();

  const picks = Array.from(new Set([...packTopics, ...recent])).filter((x) => x && x !== topic.trim()).slice(0, 6);
  const fromPacks = new Set(packTopics);

  const write = async () => {
    const description = topic.trim();
    if (!description) return;
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

  const text = phone ? "text-sm" : "text-xs";
  return (
    <div data-meeting-topic className={phone ? "mb-4" : "mb-3"}>
      <label htmlFor={inputId} className={`mb-1 block font-medium text-foreground ${phone ? "text-base" : "text-xs"}`}>
        {t("meeting_topic")}
      </label>
      <div className="relative">
        <textarea
          id={inputId}
          data-topic-input
          rows={2}
          maxLength={MAX_TOPIC}
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value.replace(/\n/g, " "));
            if (state !== "loading") setState("idle");
          }}
          placeholder={t("meeting_topic_placeholder")}
          className={`w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 pr-7 ${text} leading-snug text-foreground placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-ring`}
        />
        {topic && (
          <button
            type="button"
            onClick={() => setTopic("")}
            aria-label={t("meeting_topic_clear")}
            className="absolute right-1.5 top-1.5 text-gray-500 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {aiAllowed && meetingLanguages.length > 0 && (
          <button
            type="button"
            onClick={write}
            disabled={!topic.trim() || state === "loading"}
            data-topic-ai
            className={`inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 ${text} text-foreground hover:bg-muted disabled:opacity-50`}
          >
            {state === "loading" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
            {t("meeting_topic_ai")}
          </button>
        )}
        {(state === "failed" || state === "limit") && (
          <span role="alert" className={`${text} text-red-700`}>
            {t(state === "limit" ? "meeting_topic_limit" : "meeting_topic_failed")}
          </span>
        )}
      </div>
      {picks.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label={t("meeting_topic")}>
          {picks.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setTopic(p)}
              title={fromPacks.has(p) ? t("meeting_topic_packs") : t("meeting_topic_recent")}
              data-topic-pick
              className={`max-w-full truncate rounded-full border border-border px-2 py-0.5 ${phone ? "text-xs" : "text-[11px]"} text-gray-700 hover:bg-muted`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      <p className={`mt-1 ${phone ? "text-xs" : "text-[10px]"} leading-snug text-gray-600`}>{t("meeting_topic_hint")}</p>
    </div>
  );
}
