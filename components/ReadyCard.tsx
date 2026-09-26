"use client";

import { BookOpen, Loader2, Mic, MonitorPlay, UserRoundPen } from "lucide-react";
import type { TranslationMode } from "@/types/bilingual";
import { Button } from "@/components/ui/button";
import { useLanguageName, useT } from "@/lib/i18n";
import { primaryLanguageA } from "@/lib/meetingLanguages";

interface ReadyCardProps {
  translationMode: TranslationMode;
  languageA: string[];
  languageB: string;
  targetLangs: string[];
  connecting: boolean;
  onStart: () => void;
}

// First-run / idle screen: what will happen (mode + languages), one obvious
// Start button and a few tips. Replaces a faint mic icon that was below
// 2:1 contrast — every text here is ≥ 4.5:1 on white.
export default function ReadyCard({
  translationMode,
  languageA,
  languageB,
  targetLangs,
  connecting,
  onStart,
}: ReadyCardProps) {
  const t = useT();
  const langName = useLanguageName();
  const sources = languageA.includes("*")
    ? t("ready_any")
    : languageA.map(langName).join(", ");

  let modeName: string;
  let languages: string;
  if (translationMode === "two_way") {
    modeName = t("mode_between");
    languages = `${langName(primaryLanguageA(languageA))} ⇄ ${langName(languageB)}`;
  } else if (translationMode === "one_way") {
    modeName = t("mode_from_to");
    languages = `${sources} → ${langName(languageB)}`;
  } else {
    modeName = t("mode_presentation");
    languages = `${sources} → ${t("original_text")} + ${targetLangs.map(langName).join(", ")}`;
  }

  return (
    <div data-ready-card className="mx-auto w-full max-w-md rounded-xl border border-border bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-foreground">{t("ready_title")}</h2>
      <p className="mt-1 text-sm leading-relaxed text-gray-700">
        <span className="font-medium text-foreground">{modeName}</span>
        <span aria-hidden> · </span>
        {languages}
      </p>
      <Button
        onClick={onStart}
        disabled={connecting}
        data-ready-start
        className="mt-4 h-12 w-full text-base"
      >
        {connecting ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
        {connecting ? t("connecting") : t("start_recording")}
      </Button>
      <ul className="mt-5 space-y-2 text-sm leading-snug text-gray-700">
        <li className="flex gap-2">
          <BookOpen className="mt-0.5 size-4 shrink-0 text-gray-600" aria-hidden />
          {t("ready_tip_terms")}
        </li>
        {/* The multilingual table has no inline rename */}
        {translationMode !== "presentation" && (
          <li className="flex gap-2">
            <UserRoundPen className="mt-0.5 size-4 shrink-0 text-gray-600" aria-hidden />
            {t("ready_tip_rename")}
          </li>
        )}
        {/* A keyboard shortcut means nothing on a phone (the status bar
            button is there instead) */}
        <li className="flex gap-2 [@media(pointer:coarse)]:hidden">
          <MonitorPlay className="mt-0.5 size-4 shrink-0 text-gray-600" aria-hidden />
          {t("ready_tip_present")}
        </li>
      </ul>
    </div>
  );
}
