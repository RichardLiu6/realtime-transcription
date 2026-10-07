"use client";

// 会议设置: the phone layout's mode and language panel. Three modes —
// 互译 (2 languages = face-to-face, 3+ = group meeting), 单向翻译, 纯转录 —
// then the languages, then one line saying what will happen.

import { useMemo, useState } from "react";
import { ArrowUpDown, Check, Headphones, Minus, Plus, Search, Text, Users, UsersRound } from "lucide-react";
import { SONIOX_LANGUAGES, type TranslationMode } from "@/types/bilingual";
import { useLocale, useT } from "@/lib/i18n";
import {
  applyMutual,
  applyPhoneMode,
  mutualLanguages,
  phoneModeOf,
  type MeetingSettingsSetters,
  type PhoneMode,
} from "@/lib/phoneModes";
import { BottomSheet, homeLanguage, useLangNames } from "./parts";

interface MeetingSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locked: boolean;
  translationMode: TranslationMode;
  languageA: string[];
  languageB: string;
  targetLangs: string[];
  setters: MeetingSettingsSetters;
}

const MODES: { value: PhoneMode; label: "ph_mode_mutual" | "ph_mode_oneway" | "ph_mode_transcribe" }[] = [
  { value: "mutual", label: "ph_mode_mutual" },
  { value: "oneway", label: "ph_mode_oneway" },
  { value: "transcribe", label: "ph_mode_transcribe" },
];

type Picker =
  | { kind: "add" } // 互译: one more language
  | { kind: "target" } // 单向: translate into
  | { kind: "sources" }; // 单向 / 纯转录: spoken languages (or auto)

export default function MeetingSettings({
  open,
  onOpenChange,
  locked,
  translationMode,
  languageA,
  languageB,
  targetLangs,
  setters,
}: MeetingSettingsProps) {
  const t = useT();
  const locale = useLocale();
  const { native, local } = useLangNames();
  const [picker, setPicker] = useState<Picker | null>(null);

  const mode = phoneModeOf(translationMode);
  const mutual = mutualLanguages(translationMode, languageA, languageB, targetLangs);
  const sources = languageA.filter((c) => c !== "*");

  const setMode = (next: PhoneMode) =>
    applyPhoneMode(next, translationMode, languageA, languageB, homeLanguage(locale), setters);
  const setMutual = (langs: string[]) => applyMutual(langs, translationMode, setters);

  // What will happen, in scene terms
  let hint: { icon: typeof Users; title: string; text: string };
  if (mode === "mutual" && mutual.length <= 2) {
    hint = {
      icon: Users,
      title: t("ph_scene_face"),
      text: t("ph_scene_face_desc", { a: native(mutual[0]), b: native(mutual[1] ?? mutual[0]) }),
    };
  } else if (mode === "mutual") {
    hint = { icon: UsersRound, title: t("ph_scene_group"), text: t("ph_scene_group_desc", { n: mutual.length }) };
  } else if (mode === "oneway") {
    hint = { icon: Headphones, title: t("ph_scene_listen"), text: t("ph_scene_listen_desc", { b: native(languageB) }) };
  } else {
    hint = { icon: Text, title: t("ph_scene_record"), text: t("ph_scene_record_desc") };
  }
  const HintIcon = hint.icon;

  const langRow = (code: string, extra?: React.ReactNode) => (
    <div className="flex min-h-14 items-center gap-3 border-b border-border py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xl font-semibold tracking-tight text-foreground">{native(code)}</p>
        {local(code) && <p className="truncate text-xs text-gray-600">{local(code)}</p>}
      </div>
      {extra}
    </div>
  );

  const sourcesRow = (hintKey: "ph_auto_any" | "ph_auto_hint") => (
    <button
      type="button"
      disabled={locked}
      onClick={() => setPicker({ kind: "sources" })}
      className="flex min-h-14 w-full items-center gap-3 border-b border-border py-2 text-left disabled:opacity-60"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold text-foreground">
          {sources.length === 0 ? t("ph_auto") : sources.map(native).join(" · ")}
        </p>
        <p className="truncate text-xs text-gray-600">{sources.length === 0 ? t(hintKey) : t("ph_auto_hint")}</p>
      </div>
      <span className="text-sm font-medium text-blue-700">{t("change")}</span>
    </button>
  );

  return (
    <>
      <BottomSheet open={open} onOpenChange={onOpenChange} title={t("ph_meeting_settings")}>
        {locked && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("ph_locked")}</p>}

        {/* Mode: iOS-style segmented control */}
        <div role="radiogroup" aria-label={t("translation_mode")} className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {MODES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              disabled={locked}
              onClick={() => setMode(value)}
              className={`rounded-lg px-1 py-2 text-sm transition-colors disabled:opacity-60 ${
                mode === value ? "bg-background font-semibold text-foreground shadow-sm" : "text-gray-700"
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>

        <div className="mt-3">
          {mode === "mutual" && (
            <>
              {mutual.map((code, i) => (
                <div key={code} className="relative">
                  {langRow(
                    code,
                    <button
                      type="button"
                      aria-label={t("ph_remove_language", { name: native(code) })}
                      disabled={locked || mutual.length <= 2}
                      onClick={() => setMutual(mutual.filter((c) => c !== code))}
                      className="grid size-8 place-items-center rounded-full bg-muted text-gray-700 disabled:invisible"
                    >
                      <Minus className="size-4" />
                    </button>
                  )}
                  {/* Two languages: swap which is A and which is B */}
                  {mutual.length === 2 && i === 0 && (
                    <button
                      type="button"
                      aria-label={t("ph_swap")}
                      disabled={locked}
                      onClick={() => setMutual([mutual[1], mutual[0]])}
                      className="absolute -bottom-4 right-12 z-10 grid size-8 place-items-center rounded-full border border-border bg-background text-gray-700 shadow-sm disabled:opacity-60"
                    >
                      <ArrowUpDown className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                disabled={locked}
                onClick={() => setPicker({ kind: "add" })}
                className="flex min-h-12 w-full items-center gap-2 py-2 text-[15px] font-medium text-blue-700 disabled:opacity-60"
              >
                <Plus className="size-4" aria-hidden />
                {t("ph_add_language")}
              </button>
            </>
          )}

          {mode === "oneway" && (
            <>
              <p className="pt-1 text-xs font-medium text-gray-600">{t("ph_others_speak")}</p>
              {sourcesRow("ph_auto_any")}
              <p className="pt-3 text-xs font-medium text-gray-600">{t("ph_translate_into")}</p>
              <button
                type="button"
                disabled={locked}
                onClick={() => setPicker({ kind: "target" })}
                className="w-full text-left disabled:opacity-60"
              >
                {langRow(languageB, <span className="text-sm font-medium text-blue-700">{t("change")}</span>)}
              </button>
            </>
          )}

          {mode === "transcribe" && (
            <>
              <p className="pt-1 text-xs font-medium text-gray-600">{t("ph_spoken")}</p>
              {sourcesRow("ph_auto_hint")}
            </>
          )}
        </div>

        {/* What will happen */}
        <div className="mt-4 flex gap-3 rounded-2xl bg-muted/70 p-3" data-scene-hint>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-background text-foreground">
            <HintIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{hint.title}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-gray-700">{hint.text}</p>
          </div>
        </div>
      </BottomSheet>

      <LanguagePicker
        open={picker !== null}
        title={
          picker?.kind === "target" ? t("ph_translate_into") : picker?.kind === "sources" ? t("ph_spoken") : t("ph_add_language")
        }
        multi={picker?.kind === "sources"}
        onClose={() => setPicker(null)}
        exclude={picker?.kind === "add" ? mutual : []}
        selected={
          picker?.kind === "target" ? [languageB] : picker?.kind === "sources" ? sources : []
        }
        onPick={(codes) => {
          if (!picker) return;
          if (picker.kind === "add") setMutual([...mutual, ...codes]);
          else if (picker.kind === "target") setters.setLanguageB(codes[0]);
          else setters.setLanguageA(codes.length === 0 ? ["*"] : codes);
        }}
      />
    </>
  );
}

// Full language list with search. Single: pick one and close. Multi:
// toggle several, with 自动识别 (= none picked) at the top.
export function LanguagePicker({
  open,
  title,
  multi = false,
  onClose,
  exclude,
  selected,
  onPick,
}: {
  open: boolean;
  title: string;
  multi?: boolean;
  onClose: () => void;
  exclude: string[];
  selected: string[];
  onPick: (codes: string[]) => void;
}) {
  const t = useT();
  const { native, local } = useLangNames();
  const [query, setQuery] = useState("");

  const languages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SONIOX_LANGUAGES.filter((l) => !exclude.includes(l.code)).filter(
      (l) => !q || `${l.name} ${local(l.code)} ${l.code}`.toLowerCase().includes(q)
    );
  }, [query, exclude, local]);

  const choose = (code: string) => {
    if (!multi) {
      onPick([code]);
      onClose();
      return;
    }
    onPick(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setQuery("");
        }
      }}
      title={title}
      tall
    >
      <label className="sticky top-0 z-10 flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
        <Search className="size-4 text-gray-600" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
        />
      </label>
      <ul className="mt-1">
        {multi && !query && (
          <li>
            <button
              type="button"
              onClick={() => onPick([])}
              className="flex min-h-12 w-full items-center gap-3 border-b border-border py-2 text-left"
            >
              <span className="flex-1 text-[15px] font-semibold">{t("ph_auto")}</span>
              {selected.length === 0 && <Check className="size-5 text-blue-700" aria-hidden />}
            </button>
          </li>
        )}
        {languages.map((l) => (
          <li key={l.code}>
            <button
              type="button"
              onClick={() => choose(l.code)}
              aria-pressed={multi ? selected.includes(l.code) : undefined}
              className="flex min-h-12 w-full items-center gap-3 border-b border-border py-2 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="text-[15px] font-medium text-foreground">{native(l.code)}</span>
                {local(l.code) && <span className="ml-2 text-sm text-gray-600">{local(l.code)}</span>}
              </span>
              {selected.includes(l.code) && <Check className="size-5 text-blue-700" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}

// The pill at the top of the phone screen: what this meeting does, in
// languages ("中文 ⇄ English", "中文 · English · Tiếng Việt", "全部 → 中文")
export function useMeetingSummary(
  translationMode: TranslationMode,
  languageA: string[],
  languageB: string,
  targetLangs: string[]
): string {
  const t = useT();
  const { native } = useLangNames();
  const mode = phoneModeOf(translationMode);
  if (mode === "mutual") {
    const langs = mutualLanguages(translationMode, languageA, languageB, targetLangs);
    if (langs.length === 2) return `${native(langs[0])} ⇄ ${native(langs[1])}`;
    const shown = langs.slice(0, 3).map(native).join(" · ");
    return langs.length > 3 ? `${shown} +${langs.length - 3}` : shown;
  }
  const sources = languageA.filter((c) => c !== "*");
  if (mode === "oneway") {
    return sources.length === 0
      ? t("ph_all_to", { b: native(languageB) })
      : `${sources.map(native).join(" · ")} → ${native(languageB)}`;
  }
  return sources.length === 0 ? t("ph_transcribe_pill") : `${t("ph_transcribe_pill")} · ${sources.map(native).join(" · ")}`;
}
