"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { BilingualEntry, SonioxConfig, SonioxToken } from "@/types/bilingual";

const TARGET_SAMPLE_RATE = 24000;

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

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);
  const entryCounterRef = useRef(0);
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

  // ID of the last finalized entry (to attach translations to)
  const lastFinalizedEntryIdRef = useRef<string | null>(null);

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
      currentSegmentRef.current = null;
      return;
    }

    const originalText = seg.tokens
      .map((t) => t.text)
      .join("")
      .trim();

    if (!originalText) {
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

    const entry: BilingualEntry = {
      id: seg.entryId,
      speaker: seg.speaker,
      speakerLabel: `Speaker ${seg.speaker || "1"}`,
      language: seg.language,
      originalText,
      translatedText: transText,
      isFinal: true,
      startMs: seg.startMs,
      endMs: seg.endMs,
      timestamp: new Date(),
    };

    upsertEntry(entry);
    lastFinalizedEntryIdRef.current = seg.entryId;
    currentSegmentRef.current = null;
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

      // --- Handle translation tokens: attach to current or last entry ---
      if (translationTokens.length > 0) {
        const targetEntryId =
          currentSegmentRef.current?.entryId ||
          lastFinalizedEntryIdRef.current;

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

          // Update existing entry with translation
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
            };
            return updated;
          });
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
          // Update interim display
          const originalText = seg.tokens
            .map((t) => t.text)
            .join("")
            .trim();
          const interimOriginal = seg.interimTokens
            .map((t) => t.text)
            .join("");

          const transText =
            translationBufferRef.current?.entryId === seg.entryId
              ? translationBufferRef.current.finalText
              : "";
          const interimTrans =
            translationBufferRef.current?.entryId === seg.entryId
              ? translationBufferRef.current.interimText
              : "";

          const entry: BilingualEntry = {
            id: seg.entryId,
            speaker: seg.speaker,
            speakerLabel: `Speaker ${seg.speaker || "1"}`,
            language: seg.language,
            originalText,
            translatedText: transText.trim(),
            interimOriginal: interimOriginal || undefined,
            interimTranslated: interimTrans || undefined,
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
      lastFinalizedEntryIdRef.current = null;
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

            ws.send(
              JSON.stringify({
                api_key: token,
                model: "stt-rt-preview",
                audio_format: "pcm_s16le",
                sample_rate: 24000,
                num_channels: 1,
                language_hints: [config.languageA, config.languageB],
                enable_endpoint_detection: true,
                enable_speaker_diarization: true,
                enable_language_identification: true,
                ...(Object.keys(context).length > 0 ? { context } : {}),
                translation: {
                  type: "two_way",
                  language_a: config.languageA,
                  language_b: config.languageB,
                },
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

        source.connect(workletNode);
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
    audioContextRef.current?.close();
    audioContextRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    setRecordingState("idle");
  }, [finalizeSegment]);

  const clearEntries = useCallback(() => {
    setEntries([]);
    setElapsedSeconds(0);
    setError(null);
    entryCounterRef.current = 0;
    currentSegmentRef.current = null;
    lastFinalizedEntryIdRef.current = null;
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
    recordingState,
    error,
    elapsedSeconds,
    config: configRef.current,
    start,
    stop,
    clearEntries,
  };
}
