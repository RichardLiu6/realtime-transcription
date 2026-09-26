"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { BilingualEntry, SonioxConfig, SonioxToken, SttProvider } from "@/types/bilingual";
import { type Direction, directionFor, joinForTarget, joinTranslation } from "@/lib/t3po/protocol";
import { SimulEngine } from "@/lib/t3po/engine";
import { ClauseEngine } from "@/lib/clause/engine";
import { getLocale, t } from "@/lib/i18n";
import { singleTargetLanguage } from "@/lib/meetingLanguages";

const TARGET_SAMPLE_RATE = 16000;

// Audio frame size sent per WebSocket message. The worklet's native quantum is
// 128 samples (8 ms @ 16 kHz), i.e. ~125 postMessage + ws.send calls per second
// — batching into larger frames cuts main-thread work by >10x.
const FRAME_MS: Record<SttProvider, number> = {
  soniox: 100,
  r2t2: 160, // R2T2 decodes in 160 ms chunks (ws_server.py CHUNK_ASR_SECONDS)
};

// R2T2 end-of-audio marker (ws_server.py YOUDAO_ONETIME_ASR_EOS_STRING)
const R2T2_EOS = "YOUDAO_ONETIME_ASR_STREAM_EOS";
// Finalize an R2T2 segment after this much time without new text,
// in case the server's VAD reset never arrives
const R2T2_SILENCE_FINALIZE_MS = 2500;
// Finalize long R2T2 segments at sentence boundaries so translation keeps up
const R2T2_MAX_SEGMENT_CHARS = 120;
// Provisional (still-being-spoken) translation: at most one request per
// segment per interval, once the text has at least this many characters
const PROVISIONAL_INTERVAL_MS = 1000;
const PROVISIONAL_MIN_CHARS = 4;
// How long stop() waits for the engine to flush trailing text
const DRAIN_TIMEOUT_MS = 3000;

// Language names accepted by Qwen3-ASR (R2T2's base model)
const R2T2_LANGUAGE_NAMES: Record<string, string> = {
  zh: "Chinese", en: "English", ja: "Japanese", ko: "Korean", fr: "French",
  de: "German", es: "Spanish", pt: "Portuguese", ru: "Russian", it: "Italian",
  ar: "Arabic", th: "Thai", vi: "Vietnamese", id: "Indonesian", ms: "Malay",
  nl: "Dutch", tr: "Turkish", hi: "Hindi",
};

const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.frameSamples = (options.processorOptions && options.processorOptions.frameSamples) || 1600;
    this.buffer = new Float32Array(this.frameSamples);
    this.offset = 0;
  }
  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (channel && channel.length > 0) {
      let i = 0;
      while (i < channel.length) {
        const n = Math.min(channel.length - i, this.frameSamples - this.offset);
        this.buffer.set(channel.subarray(i, i + n), this.offset);
        this.offset += n;
        i += n;
        if (this.offset === this.frameSamples) {
          this.port.postMessage(this.buffer, [this.buffer.buffer]);
          this.buffer = new Float32Array(this.frameSamples);
          this.offset = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-frame-processor', PCMProcessor);
`;

function resampleAudio(
  input: Float32Array,
  srcRate: number,
  targetRate: number
): Float32Array {
  if (srcRate === targetRate) return input;
  const ratio = srcRate / targetRate;
  const newLength = Math.round(input.length / ratio);
  const output = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, input.length - 1);
    const frac = srcIndex - low;
    output[i] = input[low] * (1 - frac) + input[high] * frac;
  }
  return output;
}

function float32ToInt16Buffer(samples: Float32Array): ArrayBuffer {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

// Filter out Soniox control tokens like <end>, <endpoint>, etc.
function isControlToken(text: string): boolean {
  return /^<[^>]+>$/.test(text.trim());
}

// CJK character detection for language fallback
// Used when the STT engine doesn't provide a language (R2T2 never does)
function detectLanguageFromText(
  text: string,
  languageA: string[],
  languageB: string
): string {
  if (!text.trim()) return "";
  // Count CJK characters (Chinese/Japanese/Korean)
  const cjkPattern = /[一-鿿㐀-䶿　-〿぀-ゟ゠-ヿ가-힯]/g;
  const cjkMatches = text.match(cjkPattern);
  const cjkRatio = (cjkMatches?.length || 0) / text.replace(/\s/g, "").length;

  // Determine which configured language is CJK-based
  const cjkLangs = ["zh", "ja", "ko"];
  const langACJK = languageA.find((l) => cjkLangs.includes(l));
  const langANonCJK = languageA.find((l) => !cjkLangs.includes(l) && l !== "*");
  const langBIsCJK = cjkLangs.includes(languageB);

  if (cjkRatio > 0.2) {
    // Text is predominantly CJK
    if (langACJK) return langACJK;
    if (langBIsCJK) return languageB;
    return languageA[0] === "*" ? "zh" : (languageA[0] ?? "zh");
  } else {
    // Text is predominantly non-CJK (Latin, etc.)
    if (langANonCJK) return langANonCJK;
    if (!langBIsCJK) return languageB;
    return languageB;
  }
}

// R2T2 language hint: a single known language, or "zhen" (auto zh/en)
function r2t2LanguageHint(config: SonioxConfig): string {
  let langs: string[];
  if (config.translationMode === "two_way") {
    const langA = config.languageA[0] === "*" ? "zh" : (config.languageA[0] ?? "zh");
    langs = [langA, config.languageB];
  } else {
    langs = config.languageA.filter((l) => l !== "*");
  }
  const unique = Array.from(new Set(langs));
  if (unique.length === 1 && R2T2_LANGUAGE_NAMES[unique[0]]) {
    return R2T2_LANGUAGE_NAMES[unique[0]];
  }
  return "zhen";
}

// Target language of a single-target translation (two_way / one_way); the
// rule is shared with the displays that pick a sentence's language
function singleTargetFor(sourceLang: string, config: SonioxConfig): string {
  return singleTargetLanguage(config.translationMode, sourceLang, config.languageA, config.languageB);
}

// Terms may be written as "中文=English" pairs (used as enforced
// translations by Qwen-MT); speech engines just get every word
function flattenTerms(terms: string[]): string[] {
  return Array.from(new Set(terms.flatMap((t) => t.split("=").map((x) => x.trim())).filter(Boolean)));
}

// Language covering most of the text, from the per-token language tags; ""
// if the tokens carry none. Weighted in "units" — one per CJK character, one
// per Latin word — since counting letters would let "delay the launch"
// outweigh eleven Chinese characters.
const CJK_CHAR = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g;
function textUnits(text: string): number {
  const cjk = (text.match(CJK_CHAR) ?? []).length;
  const words = text.replace(CJK_CHAR, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return cjk + words;
}
function majorityLanguage(tokens: SonioxToken[]): string {
  // Soniox tokens are word pieces: join per language before counting words
  const textByLang = new Map<string, string>();
  for (const t of tokens) {
    if (!t.language) continue;
    textByLang.set(t.language, (textByLang.get(t.language) ?? "") + t.text);
  }
  const weight = new Map<string, number>();
  for (const [lang, text] of textByLang) weight.set(lang, textUnits(text));
  let best = "";
  let bestWeight = 0;
  for (const [lang, w] of weight) {
    if (w > bestWeight) {
      best = lang;
      bestWeight = w;
    }
  }
  return best;
}

type RecordingState = "idle" | "connecting" | "recording";

interface TranscriptionOptions {
  skipTranslation?: boolean;
  onSegmentFinalized?: (entryId: string, text: string, sourceLang: string) => void;
}

// Speaker ids are "<recording>:<speaker>". The first recording reads as
// before ("Speaker 1"); later ones carry the recording number
// ("Speaker 1 (#2)") because Soniox restarted its count.
export function defaultSpeakerLabel(speakerId: string): string {
  const [recording, speaker] = speakerId.includes(":")
    ? speakerId.split(":")
    : ["1", speakerId];
  const base = `Speaker ${speaker || "1"}`;
  return recording === "1" ? base : `${base} (#${recording})`;
}

export function useSonioxTranscription(options?: TranscriptionOptions) {
  const [entries, setEntries] = useState<Map<string, BilingualEntry>>(new Map());
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentInterim, setCurrentInterim] = useState("");
  const [audioAnalyser, setAudioAnalyser] = useState<AnalyserNode | null>(null);

  // Keep latest options in ref to avoid stale closures in finalizeSegment
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Latest entries, for translation context (callbacks captured by the
  // WebSocket handlers would otherwise see the entries from start())
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false);
  const sessionRef = useRef(0);
  const startedAtRef = useRef(0);
  const samplesSentRef = useRef(0);
  // Recording again continues the transcript: timestamps of the new session
  // start after the last entry instead of at 00:00
  const timeOffsetMsRef = useRef(0);
  const entryCounterRef = useRef(0);
  // Soniox numbers speakers per WebSocket session, so "1" in the next
  // recording may be someone else: each recording of the meeting gets its
  // own speaker ids ("<recording>:<speaker>")
  const recordingIndexRef = useRef(1);
  // Speakers the user said are someone already known (same name): later
  // tokens from them are filed under that person
  const speakerAliasRef = useRef<Map<string, string>>(new Map());
  const configRef = useRef<SonioxConfig | null>(null);

  // Current segment: accumulates original tokens until finalized
  const currentSegmentRef = useRef<{
    speaker: string;
    tokens: SonioxToken[];      // Final original tokens
    interimTokens: SonioxToken[]; // Non-final original tokens
    language: string;
    entryId: string;
    startMs: number;
    endMs: number;
  } | null>(null);

  // Last finalized entry data for auto-merge heuristic
  const lastFinalizedDataRef = useRef<{
    entryId: string;
    speaker: string;
    language: string;
    endMs: number;
  } | null>(null);

  const speakerIdFor = useCallback((engineSpeaker: string) => {
    const id = `${recordingIndexRef.current}:${engineSpeaker}`;
    return speakerAliasRef.current.get(id) ?? id;
  }, []);

  // Derive array from Map for external consumers
  const entriesArray = useMemo(() => Array.from(entries.values()), [entries]);

  // Upsert entry into Map (O(1) lookup). Transcript updates never carry
  // translations, so keep whatever translation the entry already shows —
  // otherwise the provisional translation would blink out on every token.
  const upsertEntry = useCallback((entry: BilingualEntry) => {
    setEntries((prev) => {
      const old = prev.get(entry.id);
      return new Map(prev).set(
        entry.id,
        old
          ? {
              ...entry,
              translatedText: entry.translatedText || old.translatedText,
              translations: entry.translations ?? old.translations,
              translationProvisional: old.translationProvisional,
            }
          : entry
      );
    });
  }, []);

  // Last translation error shown in the banner (cleared on the next success)
  const translationErrorRef = useRef<string | null>(null);

  // Per-entry translation bookkeeping (provisional throttling + ordering)
  const translationStateRef = useRef(
    new Map<string, {
      inflight: boolean;     // a provisional request is outstanding
      inflightText: string;
      lastAt: number;        // when the last provisional request was sent
      lastText: string;      // source text of the last provisional request
      shownText: string;     // source text of the translation on screen
      finalText: string | null; // set once the segment is finalized
      done: boolean;         // final translation applied
    }>()
  );

  const getTranslationState = useCallback((entryId: string) => {
    let st = translationStateRef.current.get(entryId);
    if (!st) {
      st = { inflight: false, inflightText: "", lastAt: 0, lastText: "", shownText: "", finalText: null, done: false };
      translationStateRef.current.set(entryId, st);
    }
    return st;
  }, []);

  // Translate an entry. provisional = text is still being spoken; the result
  // is shown (grey) until the final translation replaces it.
  const requestTranslation = useCallback((
    entryId: string,
    text: string,
    sourceLang: string,
    provisional = false,
  ) => {
    const config = configRef.current;
    if (!config || !text) return;
    const st = getTranslationState(entryId);

    // Build request target(s)
    let target: { targetLangs: string[] } | { targetLang: string };
    if (config.translationMode === "presentation" && config.targetLangs && config.targetLangs.length > 0) {
      // Translate into every column, including the language being spoken:
      // that column gets a clean version fully in that language, since
      // speakers mix languages. The original has its own column.
      target = { targetLangs: config.targetLangs };
    } else {
      // Single-target: two_way / one_way
      const targetLang = singleTargetFor(sourceLang, config);
      // Skip if source and target are the same
      if (sourceLang && sourceLang === targetLang) {
        st.done = true;
        return;
      }
      target = { targetLang };
    }

    if (provisional) {
      st.inflight = true;
      st.inflightText = text;
      st.lastAt = Date.now();
      st.lastText = text;
    }

    // Gather last 3 finalized entries as context
    const recent = Array.from(entriesRef.current.values())
      .filter((e) => e.isFinal && e.originalText && e.id !== entryId)
      .slice(-3);
    const context = recent.map((e) => e.originalText);
    // ...and their settled translations, as translation memory (Qwen-MT
    // can't take conversation context, only source→target pairs)
    const memory = recent
      .filter((e) => !e.translationProvisional)
      .map((e) => ({
        source: e.originalText,
        sourceLang: e.language,
        translations: e.translations ??
          (e.translatedText ? { [singleTargetFor(e.language, config)]: e.translatedText } : {}),
      }))
      .filter((m) => Object.keys(m.translations).length > 0);

    fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        sourceLang,
        uiLocale: getLocale(), // language of error messages
        context: context.length > 0 ? context : undefined,
        memory: memory.length > 0 ? memory : undefined,
        terms: config.contextTerms.length > 0 ? config.contextTerms : undefined,
        ...(provisional ? { provisional: true } : {}),
        ...target,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || t("err_translation_http", { status: res.status }));
        return data;
      })
      .then((data) => {
        if (provisional) st.inflight = false;
        // Translations work again: drop the banner a failure put up
        if (translationErrorRef.current) {
          const stale = translationErrorRef.current;
          translationErrorRef.current = null;
          setError((cur) => (cur === stale ? null : cur));
        }
        if (st.done) return; // a final translation already landed
        // A provisional result for exactly the finalized text counts as final
        const isFinal = !provisional || st.finalText === text;
        if (!isFinal && st.finalText !== null) return; // stale partial
        if (!data.translations && !data.translatedText) return;
        if (isFinal) st.done = true;
        st.shownText = text;
        setEntries((prev) => {
          const existing = prev.get(entryId);
          if (!existing) return prev;
          return new Map(prev).set(entryId, {
            ...existing,
            ...(data.translations ? { translations: data.translations } : {}),
            ...(data.translatedText ? { translatedText: data.translatedText } : {}),
            translationProvisional: !isFinal,
          });
        });
      })
      .catch((err) => {
        if (provisional) st.inflight = false;
        console.error("[Translation] Failed:", err);
        // Surface it (once per distinct message) — failing silently left the
        // transcript without translations and no hint why
        const message = err instanceof Error ? err.message : t("err_translation_failed");
        if (translationErrorRef.current !== message) {
          translationErrorRef.current = message;
          setError(message);
        }
      });
  }, [getTranslationState]);

  // Final translation for a finalized segment — reuses the provisional result
  // when it already covers exactly this text
  const requestFinalTranslation = useCallback((entryId: string, text: string, sourceLang: string) => {
    const st = getTranslationState(entryId);
    st.finalText = text;
    if (st.shownText === text) {
      st.done = true;
      setEntries((prev) => {
        const existing = prev.get(entryId);
        if (!existing || !existing.translationProvisional) return prev;
        return new Map(prev).set(entryId, { ...existing, translationProvisional: false });
      });
      return;
    }
    if (st.inflight && st.inflightText === text) return; // its response will count as final
    requestTranslation(entryId, text, sourceLang);
  }, [requestTranslation, getTranslationState]);

  // --- Streaming translation: translate while the sentence is spoken ---
  // Two engines, both fed committed (final) ASR text from any STT engine and
  // both append-only:
  //   "t3po"   — Youdao Confucius4-T3PO simultaneous model (zh<->en only)
  //   "clause" — any translation API, one clause at a time, one or several
  //              target languages per call
  // A segment can use several routes at once: in multilingual mode with
  // 同传, the zh<->en column goes through T3PO and the other columns
  // through the clause engine. Segments with no route (整句, or after a
  // failure) use sentence-level translation.
  type StreamRoute =
    | { key: string; kind: "t3po"; direction: Direction; target: string }
    | { key: string; kind: "clause"; targets: string[] };
  type StreamEngine = { feed: (entryId: string, text: string) => void; flush: (entryId: string) => void; close: () => void };
  type StreamEntry = {
    routes: StreamRoute[];
    unflushed: number; // routes still to report onFlushed
    leftover: boolean; // some route couldn't translate everything
    parts: Map<string, string[]>; // committed translation per target language
    multi: boolean; // multilingual mode: write entry.translations
    fullText: string;
    lang: string;
  };
  const streamEnginesRef = useRef(new Map<string, StreamEngine>());
  const streamEntriesRef = useRef(new Map<string, StreamEntry>());
  // Committed text seen before the segment's language was known
  const streamPendingRef = useRef(new Map<string, string>());
  // Set after a failure: the rest of the session uses sentence translation
  const streamFailedRef = useRef(false);

  const streamRoutesFor = useCallback((sourceLang: string): StreamRoute[] => {
    const config = configRef.current;
    const engine = config?.translationEngine;
    if (!config || (engine !== "t3po" && engine !== "clause") || streamFailedRef.current) return [];
    if (optionsRef.current?.skipTranslation || !sourceLang) return [];

    // Multilingual: every column, including the spoken language
    let targets: string[];
    if (config.translationMode === "presentation") {
      targets = config.targetLangs ?? [];
    } else {
      const target = singleTargetFor(sourceLang, config);
      targets = target === sourceLang ? [] : [target];
    }
    if (targets.length === 0) return [];

    const routes: StreamRoute[] = [];
    let clauseTargets = targets;
    if (engine === "t3po") {
      clauseTargets = [];
      for (const target of targets) {
        const direction = directionFor(sourceLang, target);
        if (direction) routes.push({ key: `t3po:${direction}`, kind: "t3po", direction, target });
        else clauseTargets.push(target);
      }
      // 同传 outside multilingual mode stays zh<->en only
      if (config.translationMode !== "presentation") clauseTargets = [];
    }
    if (clauseTargets.length > 0) {
      routes.push({ key: `clause:${clauseTargets.join(",")}`, kind: "clause", targets: clauseTargets });
    }
    return routes;
  }, []);

  // Latest requestFinalTranslation for the engine callbacks below
  const requestFinalTranslationRef = useRef<typeof requestFinalTranslation | null>(null);
  useEffect(() => {
    requestFinalTranslationRef.current = requestFinalTranslation;
  }, [requestFinalTranslation]);

  // Append committed translation parts to an entry and show them
  const commitStreamParts = useCallback((entryId: string, parts: Record<string, string>) => {
    const info = streamEntriesRef.current.get(entryId);
    if (!info) return;
    for (const [lang, text] of Object.entries(parts)) {
      const list = info.parts.get(lang) ?? [];
      list.push(text);
      info.parts.set(lang, list);
    }
    const joined = (lang: string) => {
      const list = info.parts.get(lang) ?? [];
      const t3po = info.routes.find((r) => r.kind === "t3po" && r.target === lang);
      return t3po?.kind === "t3po" ? joinTranslation(list, t3po.direction) : joinForTarget(list, lang);
    };
    setEntries((prev) => {
      const existing = prev.get(entryId);
      if (!existing) return prev;
      const update: Partial<BilingualEntry> = info.multi
        ? { translations: Object.fromEntries(Array.from(info.parts.keys()).map((l) => [l, joined(l)])) }
        : { translatedText: joined(Array.from(info.parts.keys())[0]) };
      return new Map(prev).set(entryId, { ...existing, ...update, translationProvisional: false });
    });
  }, []);

  const onStreamFlushed = useCallback((entryId: string, leftover: string) => {
    const info = streamEntriesRef.current.get(entryId);
    if (!info) return;
    if (leftover.trim()) info.leftover = true;
    if (--info.unflushed > 0) return;
    streamEntriesRef.current.delete(entryId);
    // Some source never got translated (a step failed, or T3PO's backend
    // couldn't force output): retranslate the whole sentence the normal way
    if (info.leftover && info.fullText) {
      requestFinalTranslationRef.current?.(entryId, info.fullText, info.lang);
    }
  }, []);

  const onStreamError = useCallback((error: unknown) => {
    console.error("[Streaming translation] step failed:", error);
    // Shown once and kept (not via translationErrorRef, which a later
    // successful sentence translation would clear): the user should know
    // the session switched to sentence translation
    if (!streamFailedRef.current) {
      setError(error instanceof Error ? error.message : t("err_simul_fallback"));
    }
    streamFailedRef.current = true;
  }, []);

  const getStreamEngine = useCallback((route: StreamRoute): StreamEngine => {
    const existing = streamEnginesRef.current.get(route.key);
    if (existing) return existing;
    let engine: StreamEngine;
    if (route.kind === "t3po") {
      const target = route.target;
      engine = new SimulEngine(
        route.direction,
        async ({ direction, history, current, force }) => {
          const res = await fetch("/api/simul", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ direction, history, current, force, terms: configRef.current?.contextTerms }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || t("err_translation_http", { status: res.status }));
          return { action: data.action === "TRANS" ? "TRANS" : "WAIT", text: String(data.text ?? "") };
        },
        {
          onCommit: (entryId, segment) => commitStreamParts(entryId, { [target]: segment }),
          onFlushed: onStreamFlushed,
          onError: onStreamError,
        }
      );
    } else {
      const routeKey = route.key;
      engine = new ClauseEngine(
        async ({ clause, sourceSoFar, translationsSoFar, sourceLang, targetLangs }) => {
          const config = configRef.current;
          const multi = config?.translationMode === "presentation";
          const withContinuation =
            !!sourceSoFar.trim() && Object.values(translationsSoFar).some((t) => t.trim());
          // Earlier sentences as context / translation memory, as usual
          const recent = Array.from(entriesRef.current.values())
            .filter((e) => e.isFinal && e.originalText && !e.translationProvisional &&
              (e.translatedText || e.translations))
            .slice(-3);
          const post = async (continuation: boolean): Promise<Record<string, string>> => {
            const res = await fetch("/api/translate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: clause,
                sourceLang,
                uiLocale: getLocale(),
                ...(multi ? { targetLangs } : { targetLang: targetLangs[0] }),
                context: recent.length > 0 ? recent.map((e) => e.originalText) : undefined,
                memory: recent.length > 0
                  ? recent.map((e) => ({
                      source: e.originalText,
                      sourceLang: e.language,
                      translations: e.translations ??
                        { [config ? singleTargetFor(e.language, config) : targetLangs[0]]: e.translatedText },
                    }))
                  : undefined,
                terms: config && config.contextTerms.length > 0 ? config.contextTerms : undefined,
                ...(continuation ? { continuation: { sourceSoFar, translationsSoFar } } : {}),
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || t("err_translation_http", { status: res.status }));
            if (multi) return (data.translations ?? {}) as Record<string, string>;
            return { [targetLangs[0]]: String(data.translatedText ?? "") };
          };

          const result = await post(withContinuation);
          if (withContinuation) {
            const missing: string[] = [];
            for (const lang of targetLangs) {
              let text = (result[lang] ?? "").trim();
              // Models sometimes restate the part already shown; keep only the new tail
              const shown = (translationsSoFar[lang] ?? "").trim();
              if (shown && text.startsWith(shown)) text = text.slice(shown.length).trim();
              result[lang] = text;
              if (!text) missing.push(lang);
            }
            // …or return nothing for it: translate the clause on its own
            // rather than drop it
            if (missing.length > 0) {
              const retry = await post(false);
              for (const lang of missing) result[lang] = (retry[lang] ?? "").trim();
            }
          }
          return result;
        },
        (entryId) => {
          const info = streamEntriesRef.current.get(entryId);
          const route = info?.routes.find((r) => r.key === routeKey);
          return info && route?.kind === "clause" ? { sourceLang: info.lang, targetLangs: route.targets } : null;
        },
        joinForTarget,
        { onCommit: commitStreamParts, onFlushed: onStreamFlushed, onError: onStreamError }
      );
    }
    streamEnginesRef.current.set(route.key, engine);
    return engine;
  }, [commitStreamParts, onStreamFlushed, onStreamError]);

  // Feed newly committed source text of a segment; true if streaming
  // translation handles it
  const simulFeed = useCallback((entryId: string, sourceLang: string, text: string): boolean => {
    let info = streamEntriesRef.current.get(entryId);
    if (!info) {
      const engine = configRef.current?.translationEngine;
      const streaming = (engine === "t3po" || engine === "clause") && !streamFailedRef.current;
      if (!sourceLang) {
        // Language not known yet: hold the text until it is
        if (text) streamPendingRef.current.set(entryId, (streamPendingRef.current.get(entryId) ?? "") + text);
        return streaming;
      }
      const pending = streamPendingRef.current.get(entryId) ?? "";
      streamPendingRef.current.delete(entryId);
      const routes = streamRoutesFor(sourceLang);
      if (routes.length === 0) return false;
      info = {
        routes,
        unflushed: routes.length,
        leftover: false,
        parts: new Map(),
        multi: configRef.current?.translationMode === "presentation",
        fullText: "",
        lang: sourceLang,
      };
      streamEntriesRef.current.set(entryId, info);
      text = pending + text;
    }
    // After a failure the sentence is retranslated whole at finalize; don't
    // keep spending calls on it
    if (text && !streamFailedRef.current) {
      for (const route of info.routes) getStreamEngine(route).feed(entryId, text);
    }
    return true;
  }, [streamRoutesFor, getStreamEngine]);

  // Segment finished: flush the rest. False if streaming isn't handling it.
  const simulFinalize = useCallback((entryId: string, fullText: string, sourceLang: string): boolean => {
    // Text held back for an unknown language gets routed now
    if (streamPendingRef.current.has(entryId)) {
      if (sourceLang) simulFeed(entryId, sourceLang, "");
      streamPendingRef.current.delete(entryId);
    }
    const info = streamEntriesRef.current.get(entryId);
    if (!info) return false;
    info.fullText = fullText;
    info.lang = sourceLang || info.lang;
    if (streamFailedRef.current) {
      streamEntriesRef.current.delete(entryId);
      requestFinalTranslation(entryId, fullText, info.lang);
      return true;
    }
    for (const route of info.routes) getStreamEngine(route).flush(entryId);
    return true;
  }, [simulFeed, getStreamEngine, requestFinalTranslation]);

  const resetSimul = useCallback(() => {
    for (const engine of streamEnginesRef.current.values()) engine.close();
    streamEnginesRef.current.clear();
    streamEntriesRef.current.clear();
    streamPendingRef.current.clear();
    streamFailedRef.current = false;
  }, []);

  // Throttled provisional translation while a segment is still being spoken
  const maybeTranslateProvisional = useCallback((entryId: string, text: string, sourceLang: string) => {
    if (optionsRef.current?.skipTranslation) return;
    // Streaming-translated segments get real incremental translation instead
    if (streamEntriesRef.current.has(entryId) || streamPendingRef.current.has(entryId)) return;
    if (sourceLang && streamRoutesFor(sourceLang).length > 0) return;
    if (!sourceLang) return; // targets depend on the source language
    const trimmed = text.trim();
    if (trimmed.length < PROVISIONAL_MIN_CHARS) return;
    const st = getTranslationState(entryId);
    if (st.inflight || st.finalText !== null) return;
    if (Date.now() - st.lastAt < PROVISIONAL_INTERVAL_MS) return;
    if (trimmed === st.lastText) return;
    requestTranslation(entryId, trimmed, sourceLang, true);
  }, [requestTranslation, getTranslationState, streamRoutesFor]);

  // Finalize current segment into an entry
  const finalizeSegment = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    const seg = currentSegmentRef.current;
    if (!seg || seg.tokens.length === 0) {
      // Remove any interim entry that was already displayed
      if (seg?.entryId) {
        setEntries((prev) => {
          if (!prev.has(seg.entryId)) return prev;
          const m = new Map(prev);
          m.delete(seg.entryId);
          return m;
        });
      }
      currentSegmentRef.current = null;
      return;
    }

    const originalText = seg.tokens
      .map((t) => t.text)
      .join("")
      .trim();

    // Nothing but punctuation (a trailing "。" finalized on its own): not a
    // sentence — drop the row, append the mark to the previous sentence, and
    // don't translate it
    if (!/[\p{L}\p{N}]/u.test(originalText)) {
      const prevId = lastFinalizedDataRef.current?.entryId;
      setEntries((prev) => {
        const m = new Map(prev);
        m.delete(seg.entryId);
        const before = prevId ? m.get(prevId) : undefined;
        if (before && originalText && !before.originalText.endsWith(originalText)) {
          m.set(prevId!, { ...before, originalText: before.originalText + originalText });
        }
        return m;
      });
      currentSegmentRef.current = null;
      setCurrentInterim("");
      return;
    }

    // The segment took the language of its first token; a leading filler
    // ("嗯") mislabelled a whole English sentence as ZH. Use the language
    // most of the text is in (Soniox tags every token).
    const majority = majorityLanguage(seg.tokens);
    if (majority) seg.language = majority;

    // Detect language via CJK fallback if not set by the engine
    if (!seg.language && configRef.current) {
      seg.language = detectLanguageFromText(
        originalText,
        configRef.current.languageA,
        configRef.current.languageB
      );
    }

    // Auto-merge: if this is a short segment close to the previous one
    // with a different speaker but same language, adopt the previous speaker
    let effectiveSpeaker = seg.speaker;
    const prev = lastFinalizedDataRef.current;
    if (prev) {
      const gap = seg.startMs - prev.endMs;
      const isShort = originalText.length < 15;
      const sameLang = seg.language === prev.language;
      const diffSpeaker = seg.speaker !== prev.speaker;
      if (gap < 2000 && isShort && sameLang && diffSpeaker) {
        effectiveSpeaker = prev.speaker;
      }
    }

    const entry: BilingualEntry = {
      id: seg.entryId,
      speaker: effectiveSpeaker,
      speakerLabel: defaultSpeakerLabel(effectiveSpeaker),
      language: seg.language,
      originalText,
      translatedText: "",
      isFinal: true,
      startMs: seg.startMs,
      endMs: seg.endMs,
      timestamp: new Date(),
    };

    upsertEntry(entry);
    lastFinalizedDataRef.current = {
      entryId: seg.entryId,
      speaker: effectiveSpeaker,
      language: seg.language,
      endMs: seg.endMs,
    };

    // Fire translation (or external callback via ref for latest callback)
    if (optionsRef.current?.skipTranslation) {
      optionsRef.current.onSegmentFinalized?.(seg.entryId, originalText, seg.language);
    } else if (!simulFinalize(seg.entryId, originalText, seg.language)) {
      requestFinalTranslation(seg.entryId, originalText, seg.language);
    }

    currentSegmentRef.current = null;
    setCurrentInterim("");
  }, [upsertEntry, requestFinalTranslation, simulFinalize]);

  // Handle Soniox WebSocket messages
  const handleSonioxMessage = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any) => {
      if (data.error_code || data.error_message) {
        setError(data.error_message || `Error code: ${data.error_code}`);
        return;
      }

      if (data.finished) {
        finalizeSegment();
        return;
      }

      if (!data.tokens || !Array.isArray(data.tokens)) return;

      // Filter out control tokens and any translation tokens (not used with GPT translation)
      const tokens: SonioxToken[] = data.tokens.filter(
        (t: SonioxToken) =>
          t.text &&
          !isControlToken(t.text) &&
          (t.translation_status || "none") !== "translation"
      );
      if (tokens.length === 0) return;

      const finalTokens = tokens.filter((t) => t.is_final);
      const interimTokens = tokens.filter((t) => !t.is_final);

      const sonioxSpeaker = tokens.find((t) => t.speaker)?.speaker;
      const batchSpeaker = sonioxSpeaker
        ? speakerIdFor(sonioxSpeaker)
        : currentSegmentRef.current?.speaker || speakerIdFor("0");

      const batchLanguage =
        tokens.find((t) => t.language)?.language || "";

      // Speaker change → finalize previous segment
      if (
        currentSegmentRef.current &&
        currentSegmentRef.current.speaker !== batchSpeaker
      ) {
        finalizeSegment();
      }

      // Initialize segment if needed
      if (!currentSegmentRef.current) {
        const newId = `entry-${entryCounterRef.current++}`;
        currentSegmentRef.current = {
          speaker: batchSpeaker,
          tokens: [],
          interimTokens: [],
          language: batchLanguage,
          entryId: newId,
          startMs: (tokens[0]?.start_ms ?? 0) + timeOffsetMsRef.current,
          endMs: 0,
        };
      }

      const seg = currentSegmentRef.current;

      // Update language if detected from Soniox or via CJK fallback
      if (batchLanguage && !seg.language) {
        seg.language = batchLanguage;
      }
      if (!seg.language && configRef.current) {
        const accumulatedText = [...seg.tokens, ...finalTokens]
          .map((t) => t.text)
          .join("");
        if (accumulatedText.length >= 3) {
          seg.language = detectLanguageFromText(
            accumulatedText,
            configRef.current.languageA,
            configRef.current.languageB
          );
        }
      }

      // Append final original tokens
      if (finalTokens.length > 0) {
        seg.tokens.push(...finalTokens);
        seg.endMs =
          (finalTokens[finalTokens.length - 1]?.end_ms ?? seg.endMs - timeOffsetMsRef.current) +
          timeOffsetMsRef.current;
        // Final tokens never change, so they can be fed for simultaneous translation
        simulFeed(seg.entryId, seg.language, finalTokens.map((t) => t.text).join(""));
      }

      // Replace interim original tokens
      seg.interimTokens = interimTokens;

      // Check if this is an endpoint (all final, no interim)
      const isEndpoint =
        finalTokens.length > 0 && interimTokens.length === 0;

      if (isEndpoint) {
        // Finalize: create the entry
        finalizeSegment();
      } else {
        // Update interim display in entries list. Only trim the start: the
        // interim part is appended right after, and trimming the end glued
        // words together ("Let's" + "review" → "Let'sreview").
        const originalText = seg.tokens
          .map((t) => t.text)
          .join("")
          .trimStart();
        const interimOriginal = seg.interimTokens
          .map((t) => t.text)
          .join("");

        upsertEntry({
          id: seg.entryId,
          speaker: seg.speaker,
          speakerLabel: defaultSpeakerLabel(seg.speaker),
          language: seg.language,
          originalText,
          translatedText: "",
          interimOriginal: interimOriginal || undefined,
          isFinal: false,
          startMs: seg.startMs,
          endMs: seg.endMs,
          timestamp: new Date(),
        });
        maybeTranslateProvisional(seg.entryId, originalText + interimOriginal, seg.language);
      }
    },
    [finalizeSegment, upsertEntry, maybeTranslateProvisional, simulFeed, speakerIdFor]
  );

  // Handle R2T2 WebSocket messages.
  // Output is append-only: each `msg.text` is new, already-committed text, and
  // `msg.reset` marks the end of a VAD segment. No speakers, no language IDs.
  const handleR2T2Message = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any) => {
      if (data.status === "error") {
        setError(`R2T2: ${data.msg || "server error"}`);
        return;
      }
      if (data.status !== "success" || !data.msg) return;

      const text: string = typeof data.msg.text === "string" ? data.msg.text : "";
      const reset = !!data.msg.reset;
      const nowMs = Math.round((samplesSentRef.current / TARGET_SAMPLE_RATE) * 1000) + timeOffsetMsRef.current;

      if (text) {
        if (!currentSegmentRef.current) {
          currentSegmentRef.current = {
            speaker: speakerIdFor("1"),
            tokens: [],
            interimTokens: [],
            language: "",
            entryId: `entry-${entryCounterRef.current++}`,
            startMs: nowMs,
            endMs: nowMs,
          };
        }
        const seg = currentSegmentRef.current;
        seg.tokens.push({
          text,
          is_final: true,
          speaker: "1",
          start_ms: nowMs,
          end_ms: nowMs,
          translation_status: "none",
          language: "",
        });
        seg.endMs = nowMs;

        const originalText = seg.tokens.map((t) => t.text).join("").trim();
        // R2T2 gives no language ID; guess it from the text so far
        if (!seg.language && configRef.current && originalText.length >= 3) {
          seg.language = detectLanguageFromText(
            originalText,
            configRef.current.languageA,
            configRef.current.languageB
          );
        }
        // R2T2 output is append-only: feed each chunk for simultaneous translation
        simulFeed(seg.entryId, seg.language, text);

        const sentenceEnd = /[。！？.!?]\s*$/.test(originalText);
        if (!reset && sentenceEnd && originalText.length >= R2T2_MAX_SEGMENT_CHARS) {
          finalizeSegment();
          return;
        }

        if (!reset) {
          upsertEntry({
            id: seg.entryId,
            speaker: seg.speaker,
            speakerLabel: defaultSpeakerLabel(seg.speaker),
            language: seg.language,
            originalText,
            translatedText: "",
            isFinal: false,
            startMs: seg.startMs,
            endMs: seg.endMs,
            timestamp: new Date(),
          });

          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(finalizeSegment, R2T2_SILENCE_FINALIZE_MS);

          maybeTranslateProvisional(seg.entryId, originalText, seg.language);
        }
      }

      if (reset) finalizeSegment();
    },
    [finalizeSegment, upsertEntry, maybeTranslateProvisional, simulFeed, speakerIdFor]
  );

  // Release microphone and audio graph
  const teardownAudio = useCallback(() => {
    workletNodeRef.current?.port.close();
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    setAudioAnalyser(null);
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }, []);

  // Start recording
  const start = useCallback(
    async (config: SonioxConfig) => {
      if (recordingState !== "idle") return;

      const provider: SttProvider = config.provider ?? "soniox";
      const session = ++sessionRef.current;

      setRecordingState("connecting");
      setError(null);
      stoppingRef.current = false;
      // Entry ids keep counting (only clearEntries resets them), so a new
      // recording appends to the transcript instead of overwriting entry-0…
      samplesSentRef.current = 0;
      const lastEnd = Math.max(0, ...Array.from(entriesRef.current.values()).map((e) => e.endMs || e.startMs || 0));
      timeOffsetMsRef.current = entriesRef.current.size > 0 ? lastEnd + 1000 : 0;
      if (entriesRef.current.size > 0) {
        recordingIndexRef.current++;
      } else {
        recordingIndexRef.current = 1;
        speakerAliasRef.current.clear();
      }
      configRef.current = config;
      currentSegmentRef.current = null;
      lastFinalizedDataRef.current = null;
      translationStateRef.current.clear();
      resetSimul();

      try {
        // 1. Credentials
        let wsUrl: string;
        let openMessage: string;
        if (provider === "r2t2") {
          const res = await fetch("/api/r2t2-config", { method: "POST" });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || "R2T2 is not available");
          wsUrl = body.url;
          openMessage = JSON.stringify({
            requestId: crypto.randomUUID(),
            secret_key: body.secretKey,
            language: r2t2LanguageHint(config),
            use_vad: true,
            mode: "slow",
            ...(config.contextTerms.length > 0
              ? { system_prompt: flattenTerms(config.contextTerms).join(", ").slice(0, 4000) }
              : {}),
          });
        } else {
          const tokenRes = await fetch("/api/soniox-token", { method: "POST" });
          if (!tokenRes.ok) {
            const err = await tokenRes.json().catch(() => ({}));
            throw new Error(err.error || "Failed to get Soniox token");
          }
          const { api_key: token } = await tokenRes.json();

          // Build language_hints for STT quality (no translation config)
          let languageHints: string[];
          if (config.translationMode === "presentation") {
            // Meeting languages = the selected source languages plus every
            // column language (e.g. zh/en/es spoken interchangeably)
            const sources = config.languageA.filter((l) => l !== "*");
            languageHints = Array.from(new Set([...sources, ...(config.targetLangs ?? [])]));
          } else if (config.translationMode === "one_way") {
            const isAny = config.languageA.length === 1 && config.languageA[0] === "*";
            languageHints = isAny ? [] : [...config.languageA];
          } else {
            const langA = config.languageA[0] === "*" ? "zh" : (config.languageA[0] ?? "zh");
            languageHints = [langA, config.languageB];
          }

          wsUrl = "wss://stt-rt.soniox.com/transcribe-websocket";
          openMessage = JSON.stringify({
            api_key: token,
            model: "stt-rt-v5", // v4 was retired 2026-06-30 (auto-routed to v5)
            audio_format: "pcm_s16le",
            sample_rate: TARGET_SAMPLE_RATE,
            num_channels: 1,
            language_hints: languageHints,
            enable_endpoint_detection: true,
            max_endpoint_delay_ms: 3000,
            enable_speaker_diarization: true,
            enable_language_identification: true,
            ...(config.contextTerms.length > 0
              ? { context: { terms: flattenTerms(config.contextTerms) } }
              : {}),
          });
        }

        // 2. Microphone
        // Browser voice processing is tuned for human listeners, not speech
        // recognition: it can suppress quiet or distant speakers, cancel
        // remote participants played through the speakers as "echo", and
        // pump the level (Chrome ties auto-gain to echoCancellation). Raw
        // audio by default; the engines do their own noise handling.
        const processing = config.audioProcessing === true;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: processing,
            noiseSuppression: processing,
            autoGainControl: processing,
            sampleRate: TARGET_SAMPLE_RATE,
          },
        });
        mediaStreamRef.current = stream;

        // 3. WebSocket
        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error(`${provider === "r2t2" ? "R2T2" : "Soniox"} connection timeout`));
          }, 10000);

          ws.onopen = () => {
            clearTimeout(timeout);
            ws.send(openMessage);
            resolve();
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            reject(new Error(`${provider === "r2t2" ? "R2T2" : "Soniox"} WebSocket error`));
          };
        });

        const handleMessage = provider === "r2t2" ? handleR2T2Message : handleSonioxMessage;
        ws.onmessage = (event) => {
          if (sessionRef.current !== session) return;
          if (typeof event.data !== "string") return;
          try {
            handleMessage(JSON.parse(event.data));
          } catch {
            // ignore
          }
        };

        ws.onclose = (event) => {
          if (sessionRef.current !== session) return;
          if (stoppingRef.current) {
            // Graceful stop: flush whatever the engine sent before closing
            finalizeSegment();
            return;
          }
          if (event.code === 4401) {
            setError("R2T2: unauthorized (check R2T2_SECRET_KEY)");
          } else if (event.code !== 1000 && event.code !== 1005) {
            setError(`${t("err_disconnected")}: ${event.code}${event.reason ? ` ${event.reason}` : ""}`);
          }
          finalizeSegment();
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          teardownAudio();
          wsRef.current = null;
          setRecordingState("idle");
        };

        ws.onerror = () => {
          if (sessionRef.current === session && !stoppingRef.current) {
            setError(t("err_websocket"));
          }
        };

        // 4. Audio graph
        const audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
        audioContextRef.current = audioContext;

        const workletBlob = new Blob([WORKLET_CODE], { type: "application/javascript" });
        const workletUrl = URL.createObjectURL(workletBlob);
        await audioContext.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        const source = audioContext.createMediaStreamSource(stream);
        const frameSamples = Math.round((audioContext.sampleRate * FRAME_MS[provider]) / 1000);
        const workletNode = new AudioWorkletNode(audioContext, "pcm-frame-processor", {
          processorOptions: { frameSamples },
        });
        workletNodeRef.current = workletNode;

        workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
          const socket = wsRef.current;
          if (!socket || socket.readyState !== WebSocket.OPEN || stoppingRef.current) return;
          let samples = event.data;
          if (audioContext.sampleRate !== TARGET_SAMPLE_RATE) {
            samples = resampleAudio(samples, audioContext.sampleRate, TARGET_SAMPLE_RATE);
          }
          socket.send(float32ToInt16Buffer(samples));
          samplesSentRef.current += samples.length;
        };

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        setAudioAnalyser(analyser);

        source.connect(analyser);
        analyser.connect(workletNode);
        workletNode.connect(audioContext.destination);

        startedAtRef.current = Date.now();
        setElapsedSeconds(0);
        timerRef.current = setInterval(() => {
          setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
        }, 1000);

        setRecordingState("recording");
      } catch (err) {
        console.error(`[${provider}] Failed to start:`, err);
        setError(err instanceof Error ? err.message : t("err_start_failed"));
        setRecordingState("idle");
        teardownAudio();
        wsRef.current?.close();
        wsRef.current = null;
      }
    },
    [recordingState, handleSonioxMessage, handleR2T2Message, finalizeSegment, teardownAudio, resetSimul]
  );

  const stop = useCallback(() => {
    stoppingRef.current = true;
    const provider = configRef.current?.provider ?? "soniox";

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop capturing audio right away
    teardownAudio();

    // Ask the engine to flush trailing text, then close. The ws.onclose
    // handler finalizes the last segment; the timeout covers servers that
    // never close on their own.
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(provider === "r2t2" ? R2T2_EOS : new ArrayBuffer(0));
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }, DRAIN_TIMEOUT_MS);
    } else {
      ws?.close();
      finalizeSegment();
    }

    // Report STT usage (fire-and-forget). R2T2 is self-hosted, so only
    // Soniox minutes are billed.
    const seconds = startedAtRef.current
      ? Math.round((Date.now() - startedAtRef.current) / 1000)
      : 0;
    startedAtRef.current = 0;
    if (provider === "soniox" && seconds > 0) {
      fetch("/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "stt", seconds }),
      }).catch(() => {});
    }

    setRecordingState("idle");
  }, [finalizeSegment, teardownAudio]);

  // Reassign a single (finalized) entry's speaker — a manual correction of
  // one sentence; the speakers' other sentences stay where they are.
  // `newSpeaker` is a "<recording>:<speaker>" id that is still in use
  // (merged-away ids are no longer offered).
  const reassignSpeaker = useCallback(
    (entryId: string, newSpeaker: string) => {
      // The next short segment may adopt the previous sentence's speaker
      // (auto-merge): follow the correction
      if (lastFinalizedDataRef.current?.entryId === entryId) {
        lastFinalizedDataRef.current.speaker = newSpeaker;
      }
      setEntries((prev) => {
        const existing = prev.get(entryId);
        if (!existing || existing.speaker === newSpeaker) return prev;
        return new Map(prev).set(entryId, {
          ...existing,
          speaker: newSpeaker,
          speakerLabel: defaultSpeakerLabel(newSpeaker),
        });
      });
    },
    []
  );

  // The user said `from` is the same person as `to` (named them alike):
  // file their sentences, and whatever they say next, under `to`
  const mergeSpeaker = useCallback((from: string, to: string) => {
    if (from === to) return;
    const aliases = speakerAliasRef.current;
    for (const [k, v] of aliases) if (v === from) aliases.set(k, to);
    aliases.set(from, to);
    if (currentSegmentRef.current?.speaker === from) currentSegmentRef.current.speaker = to;
    if (lastFinalizedDataRef.current?.speaker === from) lastFinalizedDataRef.current.speaker = to;
    setEntries((prev) => {
      const next = new Map(prev);
      for (const [id, e] of prev) {
        if (e.speaker === from) {
          next.set(id, { ...e, speaker: to, speakerLabel: defaultSpeakerLabel(to) });
        }
      }
      return next;
    });
  }, []);

  const clearEntries = useCallback(() => {
    setEntries(new Map());
    setElapsedSeconds(0);
    setError(null);
    setCurrentInterim("");
    entryCounterRef.current = 0;
    timeOffsetMsRef.current = 0;
    recordingIndexRef.current = 1;
    speakerAliasRef.current.clear();
    currentSegmentRef.current = null;
    lastFinalizedDataRef.current = null;
    translationStateRef.current.clear();
    resetSimul();
  }, [resetSimul]);

  useEffect(() => {
    return () => {
      sessionRef.current++;
      if (timerRef.current) clearInterval(timerRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      wsRef.current?.close();
      workletNodeRef.current?.disconnect();
      audioContextRef.current?.close().catch(() => {});
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    entries: entriesArray,
    currentInterim,
    recordingState,
    error,
    elapsedSeconds,
    config: configRef.current,
    audioAnalyser,
    start,
    stop,
    clearEntries,
    reassignSpeaker,
    mergeSpeaker,
  };
}
