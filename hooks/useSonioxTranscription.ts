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

  // Token assembly: accumulate tokens per speaker segment
  // Each segment groups tokens by speaker, separating original vs translation
  const currentSegmentRef = useRef<{
    speaker: string;
    originalTokens: SonioxToken[]; // translation_status === "original" or "none"
    translationTokens: SonioxToken[]; // translation_status === "translation"
    interimOriginalTokens: SonioxToken[];
    interimTranslationTokens: SonioxToken[];
    entryId: string | null;
    language: string; // detected language of original
  }>({
    speaker: "",
    originalTokens: [],
    translationTokens: [],
    interimOriginalTokens: [],
    interimTranslationTokens: [],
    entryId: null,
    language: "",
  });

  const resetSegment = () => {
    currentSegmentRef.current = {
      speaker: "",
      originalTokens: [],
      translationTokens: [],
      interimOriginalTokens: [],
      interimTranslationTokens: [],
      entryId: null,
      language: "",
    };
  };

  // Build a BilingualEntry from current segment state
  const buildEntry = useCallback(
    (isFinal: boolean): BilingualEntry | null => {
      const seg = currentSegmentRef.current;
      if (!seg.speaker && seg.originalTokens.length === 0 && seg.interimOriginalTokens.length === 0) {
        return null;
      }

      const originalText = seg.originalTokens.map((t) => t.text).join("").trim();
      const translatedText = seg.translationTokens.map((t) => t.text).join("").trim();
      const interimOriginal = seg.interimOriginalTokens.map((t) => t.text).join("");
      const interimTranslated = seg.interimTranslationTokens.map((t) => t.text).join("");

      // Detect language from original tokens
      const lang = seg.language || seg.originalTokens[0]?.language || seg.interimOriginalTokens[0]?.language || "";

      const allTokens = [...seg.originalTokens, ...seg.interimOriginalTokens];
      const startMs = allTokens[0]?.start_ms ?? 0;
      const endMs = allTokens[allTokens.length - 1]?.end_ms ?? 0;

      const id = seg.entryId ?? `entry-${entryCounterRef.current++}`;

      if (!originalText && !interimOriginal) return null;

      return {
        id,
        speaker: seg.speaker || "0",
        speakerLabel: `Speaker ${seg.speaker || "1"}`,
        language: lang,
        originalText,
        translatedText,
        interimOriginal: isFinal ? undefined : interimOriginal || undefined,
        interimTranslated: isFinal ? undefined : interimTranslated || undefined,
        isFinal,
        startMs,
        endMs,
        timestamp: new Date(),
      };
    },
    []
  );

  // Upsert entry into the entries list
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

  // Finalize current segment
  const finalizeCurrentSegment = useCallback(() => {
    const entry = buildEntry(true);
    if (entry) {
      upsertEntry(entry);
    }
    resetSegment();
  }, [buildEntry, upsertEntry]);

  // Handle Soniox WebSocket messages
  const handleSonioxMessage = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any) => {
      if (data.error_code || data.error_message) {
        setError(data.error_message || `Error code: ${data.error_code}`);
        return;
      }

      if (data.finished) {
        console.log("[Soniox] Session finished");
        finalizeCurrentSegment();
        return;
      }

      if (!data.tokens || !Array.isArray(data.tokens)) return;

      const tokens: SonioxToken[] = data.tokens;
      if (tokens.length === 0) return;

      const seg = currentSegmentRef.current;

      // Get speaker from first token with a speaker field
      const batchSpeaker = tokens.find((t) => t.speaker)?.speaker || seg.speaker || "0";

      // Speaker change → finalize previous segment
      if (seg.speaker && seg.speaker !== batchSpeaker && (seg.originalTokens.length > 0 || seg.interimOriginalTokens.length > 0)) {
        finalizeCurrentSegment();
      }

      // Initialize segment if needed
      if (!currentSegmentRef.current.speaker || currentSegmentRef.current.speaker !== batchSpeaker) {
        currentSegmentRef.current.speaker = batchSpeaker;
        currentSegmentRef.current.entryId = `entry-${entryCounterRef.current++}`;
      }

      // Categorize tokens by is_final and translation_status
      const finalOriginal: SonioxToken[] = [];
      const finalTranslation: SonioxToken[] = [];
      const interimOriginal: SonioxToken[] = [];
      const interimTranslation: SonioxToken[] = [];

      for (const token of tokens) {
        const status = token.translation_status || "none";
        const isOriginalOrNone = status === "original" || status === "none";

        if (token.is_final) {
          if (isOriginalOrNone) {
            finalOriginal.push(token);
            // Track language from original tokens
            if (token.language && !currentSegmentRef.current.language) {
              currentSegmentRef.current.language = token.language;
            }
          } else {
            finalTranslation.push(token);
          }
        } else {
          if (isOriginalOrNone) {
            interimOriginal.push(token);
            if (token.language && !currentSegmentRef.current.language) {
              currentSegmentRef.current.language = token.language;
            }
          } else {
            interimTranslation.push(token);
          }
        }
      }

      // Append final tokens (accumulate)
      if (finalOriginal.length > 0) {
        currentSegmentRef.current.originalTokens.push(...finalOriginal);
      }
      if (finalTranslation.length > 0) {
        currentSegmentRef.current.translationTokens.push(...finalTranslation);
      }

      // Replace interim tokens (they reset each message)
      currentSegmentRef.current.interimOriginalTokens = interimOriginal;
      currentSegmentRef.current.interimTranslationTokens = interimTranslation;

      // If all tokens are final and there are originals → endpoint, finalize
      const hasOriginals = finalOriginal.length > 0;
      const noInterim = interimOriginal.length === 0 && interimTranslation.length === 0;

      if (hasOriginals && noInterim) {
        finalizeCurrentSegment();
      } else {
        // Update interim display
        const entry = buildEntry(false);
        if (entry) {
          upsertEntry(entry);
        }
      }
    },
    [buildEntry, finalizeCurrentSegment, upsertEntry]
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
      resetSegment();

      try {
        // 1. Get Soniox temp API key
        const tokenRes = await fetch("/api/soniox-token", { method: "POST" });
        if (!tokenRes.ok) {
          const err = await tokenRes.json().catch(() => ({}));
          throw new Error(err.error || "Failed to get Soniox token");
        }
        const { api_key: token } = await tokenRes.json();

        // 2. Get microphone
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: TARGET_SAMPLE_RATE,
          },
        });
        mediaStreamRef.current = stream;

        // 3. Connect WebSocket
        const ws = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");
        wsRef.current = ws;

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error("Soniox connection timeout"));
          }, 10000);

          ws.onopen = () => {
            clearTimeout(timeout);

            // Build context object
            const context: Record<string, unknown> = {};
            if (config.contextTerms.length > 0) {
              context.terms = config.contextTerms;
            }

            // Send correct Soniox config
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
            // ignore non-JSON
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

        // 4. Set up AudioWorklet
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

          const pcmBuffer = float32ToInt16Buffer(samples);
          wsRef.current.send(pcmBuffer);
        };

        source.connect(workletNode);
        workletNode.connect(audioContext.destination);

        // 5. Start elapsed timer
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

  // Stop recording
  const stop = useCallback(() => {
    stoppingRef.current = true;
    finalizeCurrentSegment();

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

    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    setRecordingState("idle");
  }, [finalizeCurrentSegment]);

  const clearEntries = useCallback(() => {
    setEntries([]);
    setElapsedSeconds(0);
    setError(null);
    entryCounterRef.current = 0;
    resetSegment();
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
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
