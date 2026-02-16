"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  BilingualEntry,
  SonioxConfig,
  SonioxToken,
} from "@/types/bilingual";

const TARGET_SAMPLE_RATE = 24000;

// AudioWorklet processor code
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

// Resample audio from source sample rate to target sample rate
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

// Convert Float32 samples to Int16 ArrayBuffer (binary PCM frames for Soniox)
function float32ToInt16Buffer(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

// Detect language based on CJK character ratio
function detectLanguage(text: string): "zh" | "en" {
  if (!text) return "en";
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
  const cjkMatches = text.match(cjkPattern);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const totalChars = text.replace(/\s/g, "").length;
  if (totalChars === 0) return "en";
  return cjkCount / totalChars > 0.2 ? "zh" : "en";
}

type RecordingState = "idle" | "connecting" | "recording";

export function useSonioxTranscription() {
  const [entries, setEntries] = useState<BilingualEntry[]>([]);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);
  const entryCounterRef = useRef(0);

  // Token assembly: accumulate tokens per speaker segment
  const currentSegmentRef = useRef<{
    speaker: number;
    finalTokens: SonioxToken[];
    interimTokens: SonioxToken[];
    entryId: string | null;
  }>({ speaker: -1, finalTokens: [], interimTokens: [], entryId: null });

  // Build a BilingualEntry from accumulated tokens
  const buildEntry = useCallback(
    (
      id: string,
      speaker: number,
      finalTokens: SonioxToken[],
      interimTokens: SonioxToken[],
      isFinal: boolean,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      translationText?: string
    ): BilingualEntry => {
      const originalText = finalTokens.map((t) => t.text).join("");
      const interimOriginal = interimTokens.map((t) => t.text).join("");
      const language = detectLanguage(originalText || interimOriginal);
      const startMs =
        finalTokens[0]?.start_ms ?? interimTokens[0]?.start_ms ?? 0;
      const lastTokens = finalTokens.length > 0 ? finalTokens : interimTokens;
      const endMs = lastTokens[lastTokens.length - 1]?.end_ms ?? 0;

      return {
        id,
        speaker,
        speakerLabel: `Speaker ${speaker + 1}`,
        language,
        originalText: originalText.trim(),
        translatedText: translationText ?? "",
        interimOriginal: isFinal ? undefined : interimOriginal,
        interimTranslated: undefined,
        isFinal,
        startMs,
        endMs,
        timestamp: new Date(),
      };
    },
    []
  );

  // Finalize the current segment and push to entries
  const finalizeCurrentSegment = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (translationText?: string) => {
      const seg = currentSegmentRef.current;
      if (seg.finalTokens.length === 0 && seg.interimTokens.length === 0)
        return;
      if (seg.speaker < 0) return;

      const id = seg.entryId ?? `entry-${entryCounterRef.current++}`;
      const entry = buildEntry(
        id,
        seg.speaker,
        seg.finalTokens,
        [],
        true,
        translationText
      );

      if (entry.originalText.trim().length === 0) return;

      setEntries((prev) => {
        const existingIdx = prev.findIndex((e) => e.id === id);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = entry;
          return updated;
        }
        return [...prev, entry];
      });

      // Reset segment
      currentSegmentRef.current = {
        speaker: -1,
        finalTokens: [],
        interimTokens: [],
        entryId: null,
      };
    },
    [buildEntry]
  );

  // Handle Soniox WebSocket messages
  const handleSonioxMessage = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any) => {
      // Handle errors
      if (data.error_code || data.error_message) {
        setError(data.error_message || `Error code: ${data.error_code}`);
        return;
      }

      // Session finished
      if (data.finished) {
        console.log("[Soniox] Session finished");
        finalizeCurrentSegment();
        return;
      }

      if (!data.tokens || !Array.isArray(data.tokens)) return;

      const tokens: SonioxToken[] = data.tokens;
      if (tokens.length === 0) return;

      // Extract translation text if available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let translationText: string | undefined;
      if (data.translations && Array.isArray(data.translations)) {
        translationText = data.translations
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((t: any) => t.text ?? t)
          .join("");
      }

      const seg = currentSegmentRef.current;

      // Separate final and non-final tokens
      const finalTokens = tokens.filter((t) => t.is_final);
      const interimTokens = tokens.filter((t) => !t.is_final);

      // Determine the primary speaker in this batch
      const speakerId =
        finalTokens[0]?.speaker ?? interimTokens[0]?.speaker ?? 0;

      // If speaker changed and we have accumulated tokens, finalize previous segment
      if (seg.speaker >= 0 && seg.speaker !== speakerId) {
        finalizeCurrentSegment();
      }

      // Initialize or continue segment
      if (currentSegmentRef.current.speaker < 0) {
        currentSegmentRef.current.speaker = speakerId;
        currentSegmentRef.current.entryId = `entry-${entryCounterRef.current++}`;
      }

      // Append final tokens
      if (finalTokens.length > 0) {
        currentSegmentRef.current.finalTokens.push(...finalTokens);
      }

      // Replace interim tokens (they reset each message)
      currentSegmentRef.current.interimTokens = interimTokens;

      // If we got final tokens, check if we should finalize
      // (endpoint detected = all tokens in this message are final)
      const allFinal =
        finalTokens.length > 0 && interimTokens.length === 0;

      if (allFinal) {
        finalizeCurrentSegment(translationText);
      } else {
        // Update interim display
        const curSeg = currentSegmentRef.current;
        const id = curSeg.entryId!;
        const entry = buildEntry(
          id,
          curSeg.speaker,
          curSeg.finalTokens,
          curSeg.interimTokens,
          false,
          translationText
        );

        setEntries((prev) => {
          const existingIdx = prev.findIndex((e) => e.id === id);
          if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx] = entry;
            return updated;
          }
          return [...prev, entry];
        });
      }
    },
    [buildEntry, finalizeCurrentSegment]
  );

  // Start recording
  const start = useCallback(
    async (config: SonioxConfig) => {
      if (recordingState !== "idle") return;

      setRecordingState("connecting");
      setError(null);
      stoppingRef.current = false;
      entryCounterRef.current = 0;
      currentSegmentRef.current = {
        speaker: -1,
        finalTokens: [],
        interimTokens: [],
        entryId: null,
      };

      try {
        // 1. Get Soniox API key
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
        const ws = new WebSocket(
          "wss://stt-rt.soniox.com/transcribe-websocket"
        );
        wsRef.current = ws;

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error("Soniox connection timeout"));
          }, 10000);

          ws.onopen = () => {
            clearTimeout(timeout);

            // Send Soniox config
            ws.send(
              JSON.stringify({
                api_key: token,
                model: "stt-rt-preview",
                audio_format: "pcm_s16le",
                sample_rate: 24000,
                num_channels: 1,
                enable_endpoint_detection: true,
                enable_streaming_speaker_diarization: true,
                enable_global_speaker_diarization: true,
                min_num_speakers: 1,
                max_num_speakers: 10,
                enable_speaker_identification: true,
                language_hints: ["zh", "en"],
                enable_language_identification: true,
                enable_dictation: true,
                enable_profanity_filter: false,
                content_moderation_phrases: [],
                context_terms: config.contextTerms,
                enable_two_way_translation: true,
                two_way_translation_config: {
                  target_languages: ["zh", "en"],
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
          if (
            !stoppingRef.current &&
            event.code !== 1000 &&
            event.code !== 1005
          ) {
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
        const audioContext = new AudioContext({
          sampleRate: TARGET_SAMPLE_RATE,
        });
        audioContextRef.current = audioContext;

        const workletBlob = new Blob([WORKLET_CODE], {
          type: "application/javascript",
        });
        const workletUrl = URL.createObjectURL(workletBlob);

        await audioContext.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        const source = audioContext.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(
          audioContext,
          "soniox-pcm-processor"
        );
        workletNodeRef.current = workletNode;

        workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
            return;

          let samples = event.data;

          // Resample if needed
          if (audioContext.sampleRate !== TARGET_SAMPLE_RATE) {
            samples = resampleAudio(
              samples,
              audioContext.sampleRate,
              TARGET_SAMPLE_RATE
            );
          }

          // Send binary PCM16 frames to Soniox
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

        // Cleanup on failure
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

    // Finalize any in-progress segment
    finalizeCurrentSegment();

    // Clear elapsed timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Signal end to Soniox and close WebSocket
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(new ArrayBuffer(0));
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop AudioWorklet
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    // Close AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    setRecordingState("idle");
  }, [finalizeCurrentSegment]);

  // Clear all entries
  const clearEntries = useCallback(() => {
    setEntries([]);
    setElapsedSeconds(0);
    setError(null);
    entryCounterRef.current = 0;
    currentSegmentRef.current = {
      speaker: -1,
      finalTokens: [],
      interimTokens: [],
      entryId: null,
    };
  }, []);

  // Cleanup on unmount
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
    start,
    stop,
    clearEntries,
  };
}
