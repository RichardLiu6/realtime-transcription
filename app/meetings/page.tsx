"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, AudioLines, Search, Users } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLocale, useT } from "@/lib/i18n";
import { formatClock, formatDateTime } from "@/lib/meetings/format";
import type { MeetingSummary } from "@/lib/meetings/types";

const noSubscribe = () => () => {};
// Inside the phone layout's meeting viewer (a frame over the recording
// page), which has its own close button
const isEmbedded = () => window.self !== window.top;

// My meetings: the user's saved meetings and those shared with them,
// newest first, with a search over titles and text
export default function MeetingsPage() {
  const t = useT();
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const embedded = useSyncExternalStore(noSubscribe, isEmbedded, () => false);

  useEffect(() => {
    const controller = new AbortController();
    // Typing: wait for a pause before searching
    const timer = setTimeout(() => {
      fetch(`/api/meetings?q=${encodeURIComponent(search.trim())}`, { signal: controller.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => {
          setMeetings(d.meetings);
          setFailed(false);
        })
        .catch((e) => {
          if (e?.name !== "AbortError") setFailed(true);
        });
    }, search ? 300 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  useEffect(() => {
    document.title = t("my_meetings");
  }, [t]);

  return (
    <div className="min-h-dvh bg-background">
      <header className="safe-top safe-x sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2">
          {embedded ? (
            <span />
          ) : (
            <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-700 hover:text-foreground">
              <ArrowLeft className="size-4" aria-hidden />
              {t("back_to_app")}
            </Link>
          )}
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-xl font-semibold">{t("my_meetings")}</h1>
        <label className="mt-4 flex items-center gap-2 rounded-md border border-input px-3 py-2 focus-within:border-ring">
          <Search className="size-4 text-gray-500" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("meetings_search")}
            aria-label={t("meetings_search")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>

        {failed ? (
          <p role="alert" className="mt-8 text-sm text-red-700">{t("save_error")}</p>
        ) : meetings === null ? (
          <p className="mt-8 text-sm text-gray-600">{t("loading")}</p>
        ) : meetings.length === 0 ? (
          <p className="mt-8 text-sm text-gray-600" data-meetings-empty>
            {search.trim() ? t("meetings_no_match") : t("meetings_empty")}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-md border border-border" data-meetings-list>
            {meetings.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/meetings/${m.id}`}
                  data-meeting={m.id}
                  className="block px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">
                      {m.title || `${t("meetings_untitled")} · ${formatDateTime(m.createdAt, locale)}`}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-gray-600">{formatClock(m.durationMs)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                    <span>{formatDateTime(m.createdAt, locale)}</span>
                    <span>{t("meeting_sentences", { n: m.entryCount })}</span>
                    {m.recordingCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <AudioLines className="size-3.5" aria-hidden />
                        {t("meeting_has_audio")}
                      </span>
                    )}
                    {m.shared && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                        <Users className="size-3.5" aria-hidden />
                        {t("meetings_shared")} · {m.ownerEmail}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
