"use client";

import { useMemo } from "react";

const translations = {
  en: {
    // Recording
    "start_recording": "Start Recording",
    "stop_recording": "Stop Recording",
    "stop": "Stop",
    "connecting": "Connecting...",

    // STT engine
    "stt_engine": "Speech engine",
    "stt_soniox_desc": "Soniox cloud: speaker diarization, 60+ languages",
    "stt_r2t2_desc": "Youdao R2T2 (self-hosted): low-latency Chinese/English, no speaker diarization",
    "stt_r2t2_unavailable": "R2T2 server not configured (set R2T2_WS_URL and R2T2_SECRET_KEY)",

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
    "mode_presentation": "Multilingual",
    "mode_presentation_desc": "Each sentence shown in every selected language, side by side",
    "target_languages": "Meeting Languages (one column each)",

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

    // STT engine
    "stt_engine": "识别引擎",
    "stt_soniox_desc": "Soniox 云端识别：支持说话人区分、60+ 语言",
    "stt_r2t2_desc": "有道 R2T2 自部署模型：中英文低延迟，无说话人区分",
    "stt_r2t2_unavailable": "R2T2 服务未配置（需要 R2T2_WS_URL 和 R2T2_SECRET_KEY）",

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
    "mode_presentation": "多语言",
    "mode_presentation_desc": "每句话同时显示为所选的每种语言，分列对照",
    "target_languages": "会议语言（每种一列）",

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

type Locale = keyof typeof translations;
type TranslationKey = keyof typeof translations.en;

function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const lang = navigator.language || "en";
  // Match zh-CN, zh-TW, zh-HK, zh etc.
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

let cachedLocale: Locale | null = null;

export function getLocale(): Locale {
  if (!cachedLocale) cachedLocale = detectLocale();
  return cachedLocale;
}

export function t(key: TranslationKey): string {
  const locale = getLocale();
  return translations[locale][key] ?? translations.en[key] ?? key;
}

export function useT() {
  return useMemo(() => {
    const locale = getLocale();
    return (key: TranslationKey): string =>
      translations[locale][key] ?? translations.en[key] ?? key;
  }, []);
}
