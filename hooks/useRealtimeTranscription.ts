"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { TranscriptEntry } from "@/types";

// Detect language from text content using character analysis
function detectLanguageFromText(text: string): string {
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const spanishChars = (text.match(/[áéíóúñ¿¡üÁÉÍÓÚÑ¿¡Ü]/g) || []).length;
  const totalChars = text.replace(/\s/g, "").length;
  if (totalChars === 0) return "unknown";
  if (cjkCount / totalChars > 0.2) return "zh";
  if (spanishChars > 0) return "es";
  return "en";
}

// AudioWorklet processor code as inline string (24kHz mono PCM16)
const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      // Clone the Float32Array and send to main thread
      this.port.postMessage(new Float32Array(input[0]));
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
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

// Convert Float32 samples to base64-encoded PCM16
function float32ToBase64PCM16(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const TARGET_SAMPLE_RATE = 24000;
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;

interface UseRealtimeTranscriptionOptions {
  speakerRef?: React.RefObject<string>;
  languageHint?: string;
}

export function useRealtimeTranscription(
  options: UseRealtimeTranscriptionOptions = {}
) {
  const { speakerRef, languageHint } = options;

  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(false);
  const interimTextRef = useRef<Map<string, string>>(new Map());
  const processingCountRef = useRef(0);

  // Track current interim entry for display
  const updateProcessing = useCallback((delta: number) => {
    processingCountRef.current = Math.max(
      0,
      processingCountRef.current + delta
    );
    setIsProcessing(processingCountRef.current > 0);
  }, []);

  // Translate completed text
  const translateText = useCallback(
    async (entryId: string, text: string, detectedLang: string) => {
      updateProcessing(1);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, detectedLang }),
        });
        if (!res.ok) throw new Error("Translation failed");
        const data = await res.json();
        setTranscripts((prev) =>
          prev.map((e) =>
            e.id === entryId ? { ...e, translations: data.translations } : e
          )
        );
      } catch (err) {
        console.error("Translation error:", err);
      } finally {
        updateProcessing(-1);
      }
    },
    [updateProcessing]
  );

  // Connect WebSocket to OpenAI Realtime API
  const connectWebSocket = useCallback(
    async (stream: MediaStream) => {
      setIsConnecting(true);
      setError(null);

      try {
        // 1. Get ephemeral token
        const tokenRes = await fetch("/api/realtime-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language: languageHint || undefined,
          }),
        });
        if (!tokenRes.ok) {
          const err = await tokenRes.json().catch(() => ({}));
          throw new Error(err.error || "Failed to get session token");
        }
        const { token } = await tokenRes.json();

        // 2. Create WebSocket connection
        const wsUrl =
          "wss://api.openai.com/v1/realtime?intent=transcription&model=gpt-4o-transcribe";
        const ws = new WebSocket(wsUrl, [
          "realtime",
          `openai-insecure-api-key.${token}`,
        ]);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnecting(false);
          setIsRecording(true);
          reconnectAttemptsRef.current = 0;

          // 3. Start sending audio
          startAudioCapture(stream);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleRealtimeEvent(data);
          } catch {
            // Ignore non-JSON messages
          }
        };

        ws.onerror = () => {
          setError("WebSocket connection error");
        };

        ws.onclose = () => {
          setIsRecording(false);
          setIsConnecting(false);

          // Auto-reconnect if still should be recording
          if (shouldReconnectRef.current) {
            if (
              reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
            ) {
              reconnectAttemptsRef.current++;
              setTimeout(() => {
                if (shouldReconnectRef.current && mediaStreamRef.current) {
                  connectWebSocket(mediaStreamRef.current);
                }
              }, RECONNECT_DELAY_MS);
            } else {
              setError("Connection lost. Please restart recording.");
              shouldReconnectRef.current = false;
            }
          }
        };
      } catch (err) {
        setIsConnecting(false);
        setError(err instanceof Error ? err.message : "Connection failed");
      }
    },
    [languageHint] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Handle Realtime API events
  const handleRealtimeEvent = useCallback(
    (event: {
      type: string;
      item_id?: string;
      delta?: string;
      transcript?: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    }) => {
      switch (event.type) {
        case "conversation.item.input_audio_transcription.delta": {
          const itemId = event.item_id;
          if (!itemId || !event.delta) break;

          // Accumulate interim text
          const current = interimTextRef.current.get(itemId) || "";
          const updated = current + event.delta;
          interimTextRef.current.set(itemId, updated);

          // Update or create interim transcript entry
          setTranscripts((prev) => {
            const existing = prev.find((e) => e.id === itemId);
            if (existing) {
              return prev.map((e) =>
                e.id === itemId ? { ...e, interimText: updated } : e
              );
            }
            // Create new entry with interim text
            const speaker = speakerRef?.current || "";
            return [
              ...prev,
              {
                id: itemId,
                text: "",
                interimText: updated,
                language: "unknown",
                translations: { zh: "", en: "", es: "" },
                timestamp: new Date(),
                speaker,
              },
            ];
          });
          break;
        }

        case "conversation.item.input_audio_transcription.completed": {
          const itemId = event.item_id;
          const transcript = event.transcript?.trim();
          if (!itemId) break;

          // Clean up interim tracking
          interimTextRef.current.delete(itemId);

          if (!transcript || transcript.length < 2) {
            // Remove the interim entry if text is too short
            setTranscripts((prev) => prev.filter((e) => e.id !== itemId));
            break;
          }

          const detectedLang = detectLanguageFromText(transcript);

          // Finalize the entry: clear interimText, set final text
          setTranscripts((prev) => {
            const existing = prev.find((e) => e.id === itemId);
            if (existing) {
              return prev.map((e) =>
                e.id === itemId
                  ? {
                      ...e,
                      text: transcript,
                      interimText: undefined,
                      language: detectedLang,
                    }
                  : e
              );
            }
            // Entry doesn't exist yet (no deltas received)
            const speaker = speakerRef?.current || "";
            return [
              ...prev,
              {
                id: itemId,
                text: transcript,
                language: detectedLang,
                translations: { zh: "", en: "", es: "" },
                timestamp: new Date(),
                speaker,
              },
            ];
          });

          // Trigger translation
          translateText(itemId, transcript, detectedLang);
          break;
        }

        case "error": {
          console.error("Realtime API error:", event);
          setError(event.error?.message || "Realtime API error");
          break;
        }
      }
    },
    [speakerRef, translateText]
  );

  // Start audio capture via AudioWorklet
  const startAudioCapture = useCallback(
    (stream: MediaStream) => {
      const audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      audioContextRef.current = audioContext;

      const workletBlob = new Blob([WORKLET_CODE], {
        type: "application/javascript",
      });
      const workletUrl = URL.createObjectURL(workletBlob);

      audioContext.audioWorklet
        .addModule(workletUrl)
        .then(() => {
          URL.revokeObjectURL(workletUrl);

          const source = audioContext.createMediaStreamSource(stream);
          const workletNode = new AudioWorkletNode(
            audioContext,
            "pcm-processor"
          );
          workletNodeRef.current = workletNode;

          workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
            const ws = wsRef.current;
            if (!ws || ws.readyState !== WebSocket.OPEN) return;

            let samples = event.data;

            // Resample if AudioContext didn't use our target rate
            if (audioContext.sampleRate !== TARGET_SAMPLE_RATE) {
              samples = resampleAudio(
                samples,
                audioContext.sampleRate,
                TARGET_SAMPLE_RATE
              );
            }

            const base64Audio = float32ToBase64PCM16(samples);
            ws.send(
              JSON.stringify({
                type: "input_audio_buffer.append",
                audio: base64Audio,
              })
            );
          };

          source.connect(workletNode);
          workletNode.connect(audioContext.destination);
        })
        .catch((err) => {
          URL.revokeObjectURL(workletUrl);
          console.error("AudioWorklet setup failed:", err);
          setError("Audio capture setup failed");
        });
    },
    []
  );

  // Start recording
  const start = useCallback(async () => {
    setError(null);
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    interimTextRef.current.clear();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: TARGET_SAMPLE_RATE,
        },
      });
      mediaStreamRef.current = stream;
      await connectWebSocket(stream);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to access microphone"
      );
    }
  }, [connectWebSocket]);

  // Stop recording
  const stop = useCallback(() => {
    shouldReconnectRef.current = false;

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop audio worklet
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media stream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    setIsRecording(false);
    setIsConnecting(false);
    processingCountRef.current = 0;
    setIsProcessing(false);
  }, []);

  // Clear transcripts
  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      wsRef.current?.close();
      workletNodeRef.current?.disconnect();
      audioContextRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    transcripts,
    isRecording,
    isProcessing,
    isConnecting,
    error,
    start,
    stop,
    clearTranscripts,
  };
}
