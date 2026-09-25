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
    "audio_processing": "Noise reduction",
    "translation_engine": "Translation",
    "tr_llm": "Sentence",
    "tr_t3po": "Live",
    "tr_llm_desc": "Translate each sentence after it ends (Qwen / GPT / Claude, set in admin). Works for all languages.",
    "tr_t3po_desc": "Simultaneous interpretation with Youdao T3PO: translation appears while the sentence is still being spoken. Chinese↔English only; other languages fall back to sentence translation.",
    "tr_t3po_unavailable": "Simultaneous translation not configured (set T3PO_BASE_URL to a server running Confucius4-T3PO)",
    "audio_processing_on": "Browser noise suppression, echo cancellation and auto gain are ON. Use in noisy rooms; may drop quiet or distant speakers.",
    "audio_processing_off": "Raw microphone audio (recommended for accuracy). Turn on only in very noisy rooms.",

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
    "add_term_placeholder": "Add term (or 中文=English), press Enter",
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
    "audio_processing": "降噪",
    "translation_engine": "翻译方式",
    "tr_llm": "整句",
    "tr_t3po": "同传",
    "tr_llm_desc": "每句话说完再翻译（千问 / GPT / Claude，在后台设置），支持所有语言。",
    "tr_t3po_desc": "有道 T3PO 同声传译：话还没说完译文就开始出现。仅支持中英互译，其他语言自动改用整句翻译。",
    "tr_t3po_unavailable": "同传翻译未配置（需要把 T3PO_BASE_URL 指向运行 Confucius4-T3PO 的服务器）",
    "audio_processing_on": "已开启浏览器降噪、回声消除和自动增益。适合嘈杂环境，但可能压掉声音小或离麦克风远的发言人。",
    "audio_processing_off": "使用原始麦克风音频（识别更准，推荐）。只在环境非常嘈杂时开启降噪。",

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
    "add_term_placeholder": "输入术语（可写 中文=English），回车添加",
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
