"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { BilingualEntry, SonioxConfig, SonioxToken } from "@/types/bilingual";

const TARGET_SAMPLE_RATE = 16000;

const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage(new Float32Array(input[0]));
    }
    return true;
  }
}
registerProcessor('soniox-pcm-processor', PCMProcessor);
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
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

// Filter out Soniox control tokens like <end>, <endpoint>, etc.
function isControlToken(text: string): boolean {
  return /^<[^>]+>$/.test(text.trim());
}

// CJK character detection for language fallback
// Used when Soniox doesn't provide the language field on tokens
function detectLanguageFromText(
  text: string,
  languageA: string,
  languageB: string
): string {
  if (!text.trim()) return "";
  // Count CJK characters (Chinese/Japanese/Korean)
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;
  const cjkMatches = text.match(cjkPattern);
  const cjkRatio = (cjkMatches?.length || 0) / text.replace(/\s/g, "").length;

  // Determine which configured language is CJK-based
  const cjkLangs = ["zh", "ja", "ko"];
  const langAIsCJK = cjkLangs.includes(languageA);
  const langBIsCJK = cjkLangs.includes(languageB);

  if (cjkRatio > 0.2) {
    // Text is predominantly CJK
    if (langAIsCJK) return languageA;
    if (langBIsCJK) return languageB;
    return languageA; // fallback
  } else {
    // Text is predominantly non-CJK (Latin, etc.)
    if (!langAIsCJK) return languageA;
    if (!langBIsCJK) return languageB;
    return languageB; // fallback
  }
}

type RecordingState = "idle" | "connecting" | "recording";

export function useSonioxTranscription() {
  const [entries, setEntries] = useState<BilingualEntry[]>([]);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentInterim, setCurrentInterim] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);
  const entryCounterRef = useRef(0);
  const configRef = useRef<SonioxConfig | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

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

  // Queue of finalized entry IDs awaiting translation (FIFO)
  const pendingTranslationQueue = useRef<string[]>([]);

  // Last finalized entry data for auto-merge heuristic
  const lastFinalizedDataRef = useRef<{
    speaker: string;
    language: string;
    endMs: number;
  } | null>(null);

  // Accumulated translation text for the current/last entry
  const translationBufferRef = useRef<{
    entryId: string;
    finalText: string;
    interimText: string;
  } | null>(null);

  // Upsert entry
  const upsertEntry = useCallback((entry: BilingualEntry) => {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === entry.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = entry;
        return updated;
      }
      return [...prev, entry];
    });
  }, []);

  // Finalize current segment into an entry
  const finalizeSegment = useCallback(() => {
    const seg = currentSegmentRef.current;
    if (!seg || seg.tokens.length === 0) {
      // Remove any interim entry that was already displayed
      if (seg?.entryId) {
        setEntries((prev) => prev.filter((e) => e.id !== seg.entryId));
      }
      currentSegmentRef.current = null;
      return;
    }

    const originalText = seg.tokens
      .map((t) => t.text)
      .join("")
      .trim();

    if (!originalText) {
      // Remove any interim entry that was already displayed
      setEntries((prev) => prev.filter((e) => e.id !== seg.entryId));
      currentSegmentRef.current = null;
      return;
    }

    // Detect language via CJK fallback if not set by Soniox
    if (!seg.language && configRef.current) {
      seg.language = detectLanguageFromText(
        originalText,
        configRef.current.languageA,
        configRef.current.languageB
      );
    }

    // Get any accumulated translation
    const transText =
      translationBufferRef.current?.entryId === seg.entryId
        ? translationBufferRef.current.finalText
        : "";

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
      speakerLabel: `Speaker ${effectiveSpeaker || "1"}`,
      language: seg.language,
      originalText,
      translatedText: transText,
      isFinal: true,
      startMs: seg.startMs,
      endMs: seg.endMs,
      timestamp: new Date(),
    };

    upsertEntry(entry);
    pendingTranslationQueue.current.push(seg.entryId);
    lastFinalizedDataRef.current = {
      speaker: effectiveSpeaker,
      language: seg.language,
      endMs: seg.endMs,
    };
    currentSegmentRef.current = null;
    setCurrentInterim("");

    // === DEBUG: Log finalization ===
    console.log(
      `%c[FINALIZE] ${seg.entryId}`,
      "color: #22c55e; font-weight: bold",
      { speaker: effectiveSpeaker, lang: seg.language, original: originalText, translation: transText, startMs: seg.startMs, endMs: seg.endMs }
    );
    // === END DEBUG ===
  }, [upsertEntry]);

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

      // === DEBUG: Log raw token stream ===
      const rawTokens = data.tokens as SonioxToken[];
      if (rawTokens.length > 0) {
        const summary = rawTokens.map((t: SonioxToken) => ({
          text: t.text,
          final: t.is_final,
          spk: t.speaker,
          lang: t.language,
          ts: t.translation_status,
          src_lang: t.source_language,
          start: t.start_ms,
          end: t.end_ms,
        }));
        console.log(
          `%c[SONIOX RAW] ${rawTokens.length} tokens`,
          "color: #0ea5e9; font-weight: bold",
          summary
        );
      }
      // === END DEBUG ===

      // Filter out control tokens
      const tokens: SonioxToken[] = data.tokens.filter(
        (t: SonioxToken) => t.text && !isControlToken(t.text)
      );
      if (tokens.length === 0) return;

      // Split into original and translation tokens
      const originalTokens: SonioxToken[] = [];
      const translationTokens: SonioxToken[] = [];

      for (const token of tokens) {
        const status = token.translation_status || "none";
        if (status === "translation") {
          translationTokens.push(token);
        } else {
          originalTokens.push(token);
        }
      }

      // --- Handle translation tokens: match to pending queue (FIFO) or current segment ---
      if (translationTokens.length > 0) {
        // If all tokens are final, this completes a translation → consume from queue
        const allFinal = translationTokens.every((t) => t.is_final);
        const targetEntryId =
          currentSegmentRef.current?.entryId ||
          (allFinal
            ? pendingTranslationQueue.current[0] || null
            : pendingTranslationQueue.current[0] || null);

        // === DEBUG: Log translation matching ===
        console.log(
          `%c[TRANS MATCH] → ${targetEntryId}`,
          "color: #f59e0b; font-weight: bold",
          {
            text: translationTokens.map((t) => t.text).join(""),
            allFinal,
            queueLen: pendingTranslationQueue.current.length,
            queue: [...pendingTranslationQueue.current],
            fromCurrent: !!currentSegmentRef.current?.entryId,
          }
        );

        if (targetEntryId) {
          const finalTransTokens = translationTokens.filter((t) => t.is_final);
          const interimTransTokens = translationTokens.filter((t) => !t.is_final);

          if (!translationBufferRef.current || translationBufferRef.current.entryId !== targetEntryId) {
            translationBufferRef.current = {
              entryId: targetEntryId,
              finalText: "",
              interimText: "",
            };
          }

          if (finalTransTokens.length > 0) {
            translationBufferRef.current.finalText +=
              finalTransTokens.map((t) => t.text).join("");
          }
          translationBufferRef.current.interimText =
            interimTransTokens.map((t) => t.text).join("");

          // Use src_lang from translation tokens to correct language detection
          // (translation engine is more accurate than per-token lang field)
          const srcLang = translationTokens.find((t) => t.source_language)?.source_language;

          // Update existing entry with translation + corrected language
          setEntries((prev) => {
            const idx = prev.findIndex((e) => e.id === targetEntryId);
            if (idx < 0) return prev;
            const existing = prev[idx];
            const updated = [...prev];
            updated[idx] = {
              ...existing,
              translatedText: translationBufferRef.current!.finalText.trim(),
              interimTranslated:
                translationBufferRef.current!.interimText || undefined,
              ...(srcLang && srcLang !== existing.language ? { language: srcLang } : {}),
            };
            return updated;
          });

          // Pop from queue once translation is complete (all final)
          if (allFinal && pendingTranslationQueue.current[0] === targetEntryId) {
            pendingTranslationQueue.current.shift();
          }
        }
      }

      // --- Handle original tokens ---
      if (originalTokens.length > 0) {
        const finalOrigTokens = originalTokens.filter((t) => t.is_final);
        const interimOrigTokens = originalTokens.filter((t) => !t.is_final);

        const batchSpeaker =
          originalTokens.find((t) => t.speaker)?.speaker ||
          currentSegmentRef.current?.speaker ||
          "0";

        const batchLanguage =
          originalTokens.find((t) => t.language)?.language || "";

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
            startMs: originalTokens[0]?.start_ms ?? 0,
            endMs: 0,
          };
          // Reset translation buffer for new entry
          translationBufferRef.current = {
            entryId: newId,
            finalText: "",
            interimText: "",
          };
        }

        const seg = currentSegmentRef.current;

        // Update language if detected from Soniox or via CJK fallback
        if (batchLanguage && !seg.language) {
          seg.language = batchLanguage;
        }
        if (!seg.language && configRef.current) {
          const accumulatedText = [...seg.tokens, ...finalOrigTokens]
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
        if (finalOrigTokens.length > 0) {
          seg.tokens.push(...finalOrigTokens);
          seg.endMs =
            finalOrigTokens[finalOrigTokens.length - 1]?.end_ms ?? seg.endMs;
        }

        // Replace interim original tokens
        seg.interimTokens = interimOrigTokens;

        // Check if this is an endpoint (all final, no interim)
        const isEndpoint =
          finalOrigTokens.length > 0 && interimOrigTokens.length === 0;

        if (isEndpoint) {
          // Finalize: create the entry
          finalizeSegment();
        } else {
          // Update interim display in entries list
          const originalText = seg.tokens
            .map((t) => t.text)
            .join("")
            .trim();
          const interimOriginal = seg.interimTokens
            .map((t) => t.text)
            .join("");

          const entry: BilingualEntry = {
            id: seg.entryId,
            speaker: seg.speaker,
            speakerLabel: `Speaker ${seg.speaker || "1"}`,
            language: seg.language,
            originalText,
            translatedText: "",
            interimOriginal: interimOriginal || undefined,
            isFinal: false,
            startMs: seg.startMs,
            endMs: seg.endMs,
            timestamp: new Date(),
          };

          upsertEntry(entry);
        }
      }
    },
    [finalizeSegment, upsertEntry]
  );

  // Start recording
  const start = useCallback(
    async (config: SonioxConfig) => {
      if (recordingState !== "idle") return;

      setRecordingState("connecting");
      setError(null);
      stoppingRef.current = false;
      entryCounterRef.current = 0;
      configRef.current = config;
      currentSegmentRef.current = null;
      pendingTranslationQueue.current = [];
      lastFinalizedDataRef.current = null;
      translationBufferRef.current = null;

      try {
        const tokenRes = await fetch("/api/soniox-token", { method: "POST" });
        if (!tokenRes.ok) {
          const err = await tokenRes.json().catch(() => ({}));
          throw new Error(err.error || "Failed to get Soniox token");
        }
        const { api_key: token } = await tokenRes.json();

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: TARGET_SAMPLE_RATE,
          },
        });
        mediaStreamRef.current = stream;

        const ws = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");
        wsRef.current = ws;

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error("Soniox connection timeout"));
          }, 10000);

          ws.onopen = () => {
            clearTimeout(timeout);

            const context: Record<string, unknown> = {};
            if (config.contextTerms.length > 0) {
              context.terms = config.contextTerms;
            }

            // Build language_hints and translation config based on mode
            let languageHints: string[];
            let translation: Record<string, unknown>;

            if (config.translationMode === "one_way") {
              let sourceLanguages: string[];
              if (config.languageA === "*") {
                // Any Language (Auto) — no source hint needed
                sourceLanguages = ["*"];
                languageHints = [];
              } else if (config.languageB === "en") {
                // Soniox pattern: specific source → en, add source to hints, use wildcard
                sourceLanguages = ["*"];
                languageHints = [config.languageA];
              } else {
                sourceLanguages = [config.languageA];
                languageHints = [config.languageA];
              }
              translation = {
                type: "one_way",
                target_language: config.languageB,
                source_languages: sourceLanguages,
              };
            } else {
              // two_way
              languageHints = [config.languageA, config.languageB];
              translation = {
                type: "two_way",
                language_a: config.languageA,
                language_b: config.languageB,
              };
            }

            ws.send(
              JSON.stringify({
                api_key: token,
                model: "stt-rt-v4",
                audio_format: "pcm_s16le",
                sample_rate: 16000,
                num_channels: 1,
                language_hints: languageHints,
                enable_endpoint_detection: false,
                enable_speaker_diarization: true,
                enable_language_identification: true,
                ...(Object.keys(context).length > 0 ? { context } : {}),
                translation,
              })
            );

            resolve();
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            reject(new Error("Soniox WebSocket error"));
          };
        });

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleSonioxMessage(data);
          } catch {
            // ignore
          }
        };

        ws.onclose = (event) => {
          if (!stoppingRef.current && event.code !== 1000 && event.code !== 1005) {
            setError(`Disconnected: ${event.code}`);
          }
          if (!stoppingRef.current) {
            setRecordingState("idle");
          }
        };

        ws.onerror = () => {
          if (!stoppingRef.current) {
            setError("WebSocket error");
          }
        };

        const audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
        audioContextRef.current = audioContext;

        const workletBlob = new Blob([WORKLET_CODE], { type: "application/javascript" });
        const workletUrl = URL.createObjectURL(workletBlob);
        await audioContext.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        const source = audioContext.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioContext, "soniox-pcm-processor");
        workletNodeRef.current = workletNode;

        workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          let samples = event.data;
          if (audioContext.sampleRate !== TARGET_SAMPLE_RATE) {
            samples = resampleAudio(samples, audioContext.sampleRate, TARGET_SAMPLE_RATE);
          }
          wsRef.current.send(float32ToInt16Buffer(samples));
        };

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        source.connect(analyser);
        analyser.connect(workletNode);
        workletNode.connect(audioContext.destination);

        setElapsedSeconds(0);
        timerRef.current = setInterval(() => {
          setElapsedSeconds((prev) => prev + 1);
        }, 1000);

        setRecordingState("recording");
      } catch (err) {
        console.error("[Soniox] Failed to start:", err);
        setError(err instanceof Error ? err.message : "Failed to start");
        setRecordingState("idle");
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        wsRef.current?.close();
        wsRef.current = null;
        audioContextRef.current?.close();
        audioContextRef.current = null;
      }
    },
    [recordingState, handleSonioxMessage]
  );

  const stop = useCallback(() => {
    stoppingRef.current = true;
    finalizeSegment();

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(new ArrayBuffer(0));
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    analyserRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    setRecordingState("idle");
  }, [finalizeSegment]);

  // Reassign a single entry's speaker (manual correction)
  const reassignSpeaker = useCallback(
    (entryId: string, newSpeaker: string) => {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entryId ? { ...e, speaker: newSpeaker } : e
        )
      );
    },
    []
  );

  const clearEntries = useCallback(() => {
    setEntries([]);
    setElapsedSeconds(0);
    setError(null);
    setCurrentInterim("");
    entryCounterRef.current = 0;
    currentSegmentRef.current = null;
    pendingTranslationQueue.current = [];
    lastFinalizedDataRef.current = null;
    translationBufferRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      wsRef.current?.close();
      workletNodeRef.current?.disconnect();
      audioContextRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    entries,
    currentInterim,
    recordingState,
    error,
    elapsedSeconds,
    config: configRef.current,
    audioAnalyser: analyserRef.current,
    start,
    stop,
    clearEntries,
    reassignSpeaker,
  };
}
