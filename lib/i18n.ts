"use client";

import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import { localeFromLanguage, type Locale } from "@/lib/locale";

const translations = {
  en: {
    // Recording
    "start_recording": "Start Recording",
    "stop_recording": "Stop Recording",
    "stop": "Stop",
    "connecting": "Connecting...",

    // Bottom bar buttons
    "settings": "Settings",
    "terms": "Terms",
    "export": "Export",
    "new_meeting": "New Meeting",

    // Translation mode
    "translation_mode": "Translation Mode",
    "mode_between": "Between",
    "mode_from_to": "From→To",
    "mode_between_desc": "Auto-detect bilingual conversation",
    "mode_from_to_desc": "Fixed source language, translate to target",
    "mode_presentation": "Presentation",
    "mode_presentation_desc": "Multi-language table view",
    "target_languages": "Target Languages",

    // Languages
    "languages": "Languages",
    "language_a": "Language A",
    "language_b": "Language B",
    "source_language": "Source Language",
    "target_language": "Target Language",
    "any_language": "Any Language (Auto)",

    // Terms panel
    "context_terms": "Context Terms",
    "add_term_placeholder": "Add term, press Enter",
    "terms_effect_next": "Takes effect on next recording",
    "terms_effect_start": "Takes effect when recording starts",

    // Speakers
    "speakers": "Speakers",
    "words": "words",

    // Transcript
    "listening": "Listening...",
    "click_start": "Click Start Recording to begin",

    // Confirm dialogs
    "confirm_language_change": "Changing language will stop recording. Continue?",
    "confirm_mode_change": "Changing translation mode will stop recording. Continue?",
  },
  zh: {
    // Recording
    "start_recording": "开始录音",
    "stop_recording": "停止录音",
    "stop": "停止",
    "connecting": "连接中...",

    // Bottom bar buttons
    "settings": "设置",
    "terms": "术语",
    "export": "导出",
    "new_meeting": "新会议",

    // Translation mode
    "translation_mode": "翻译模式",
    "mode_between": "双向",
    "mode_from_to": "单向",
    "mode_between_desc": "自动检测双语对话",
    "mode_from_to_desc": "固定源语言，翻译到目标语言",
    "mode_presentation": "演讲",
    "mode_presentation_desc": "多语言表格视图",
    "target_languages": "目标语言",

    // Languages
    "languages": "语言",
    "language_a": "语言 A",
    "language_b": "语言 B",
    "source_language": "源语言",
    "target_language": "目标语言",
    "any_language": "任意语言（自动）",

    // Terms panel
    "context_terms": "上下文术语",
    "add_term_placeholder": "输入术语，按回车添加",
    "terms_effect_next": "下次录音时生效",
    "terms_effect_start": "开始录音时生效",

    // Speakers
    "speakers": "说话人",
    "words": "字",

    // Transcript
    "listening": "聆听中...",
    "click_start": "点击开始录音",

    // Confirm dialogs
    "confirm_language_change": "切换语言将停止录音，是否继续？",
    "confirm_mode_change": "切换翻译模式将停止录音，是否继续？",
  },
} as const;

type TranslationKey = keyof typeof translations.en;

function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  return localeFromLanguage(navigator.language);
}

let cachedLocale: Locale | null = null;

// Used by the module-level t() (event handlers only, never during render).
export function getLocale(): Locale {
  if (!cachedLocale) cachedLocale = detectLocale();
  return cachedLocale;
}

export function t(key: TranslationKey): string {
  const locale = getLocale();
  return translations[locale][key] ?? translations.en[key] ?? key;
}

// Locale resolved on the server from Accept-Language, so SSR and hydration agree.
const LocaleContext = createContext<Locale | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return createElement(LocaleContext.Provider, { value: locale }, children);
}

export function useT() {
  const contextLocale = useContext(LocaleContext);
  const locale = contextLocale ?? getLocale();
  return useMemo(
    () => (key: TranslationKey): string =>
      translations[locale][key] ?? translations.en[key] ?? key,
    [locale]
  );
}
