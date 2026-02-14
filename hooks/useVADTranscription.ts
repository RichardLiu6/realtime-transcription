"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useMicVAD } from "@ricky0123/vad-react";

import type { TranscriptEntry } from "@/types";
export type { TranscriptEntry };

function floatTo16BitPCM(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array;
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatArrayToWav(
  samples: Float32Array,
  sampleRate: number = 16000
): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");

  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  const pcmData = floatTo16BitPCM(samples);
  let offset = 44;
  for (let i = 0; i < pcmData.length; i++, offset += 2) {
    view.setInt16(offset, pcmData[i], true);
  }

  return new Blob([view], { type: "audio/wav" });
}

// Client-side audio validation: check RMS energy level
function calculateRMS(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

const MIN_RMS_THRESHOLD = 0.01;
const MIN_DURATION_MS = 500;
const SAMPLE_RATE = 16000;
const RETRY_DELAY_MS = 1000;

// Retry fetch once on 5xx or network error
async function fetchWithRetry(
  url: string,
  options: RequestInit
): Promise<Response> {
  const response = await fetch(url, options);
  if (response.status >= 500) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return fetch(url, options);
  }
  return response;
}

// Parse SSE events from a chunk of text. Returns parsed events and any
// leftover incomplete data that should be prepended to the next chunk.
interface SSEEvent {
  event: string;
  data: string;
}

function parseSSEChunk(
  text: string,
  buffer: string
): { events: SSEEvent[]; remaining: string } {
  const combined = buffer + text;
  const events: SSEEvent[] = [];
  // Split on double newline (event boundary)
  const parts = combined.split("\n\n");
  // The last part may be incomplete, so keep it as remaining
  const remaining = parts.pop() || "";

  for (const part of parts) {
    if (!part.trim()) continue;
    let eventName = "message";
    let data = "";
    for (const line of part.split("\n")) {
      if (line.startsWith("event: ")) {
        eventName = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        data = line.slice(6);
      }
    }
    if (data) {
      events.push({ event: eventName, data });
    }
  }
  return { events, remaining };
}

export function useVADTranscription(speakerRef?: React.RefObject<string>, languageHint?: string) {
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [processingCount, setProcessingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Fire-and-forget: process one audio segment (no queue blocking)
  const processAudio = useCallback(
    async (audio: Float32Array, speaker: string) => {
      if (abortControllerRef.current?.signal.aborted) {
        setProcessingCount((c) => Math.max(0, c - 1));
        return;
      }

      try {
        const wavBlob = floatArrayToWav(audio, SAMPLE_RATE);
        const formData = new FormData();
        formData.append("audio", wavBlob, "audio.wav");
        // Send language hint to improve transcription accuracy
        if (languageHint) {
          formData.append("language", languageHint);
        }

        const response = await fetchWithRetry("/api/transcribe", {
          method: "POST",
          body: formData,
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(
            errData?.error || `Transcription failed: ${response.statusText}`
          );
        }

        // --- Read SSE stream ---
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let sseBuffer = "";
        let entryId: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const { events, remaining } = parseSSEChunk(chunk, sseBuffer);
          sseBuffer = remaining;

          for (const sseEvent of events) {
            if (sseEvent.event === "transcription") {
              const data = JSON.parse(sseEvent.data);
              if (data.text?.trim()) {
                entryId = crypto.randomUUID();
                const entry: TranscriptEntry = {
                  id: entryId,
                  text: data.text,
                  language: data.language || "unknown",
                  translations: { zh: "", en: "", es: "" },
                  timestamp: new Date(),
                  speaker,
                };
                setTranscripts((prev) => [...prev, entry]);
              }
            } else if (sseEvent.event === "translation" && entryId) {
              const data = JSON.parse(sseEvent.data);
              const idToUpdate = entryId;
              setTranscripts((prev) =>
                prev.map((e) =>
                  e.id === idToUpdate
                    ? { ...e, translations: data.translations }
                    : e
                )
              );
            } else if (sseEvent.event === "error") {
              const data = JSON.parse(sseEvent.data);
              throw new Error(data.error || "Transcription failed");
            }
          }
        }

        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Transcription error:", err);
        setError(err instanceof Error ? err.message : "Transcription failed");
      } finally {
        setProcessingCount((c) => Math.max(0, c - 1));
      }
    },
    []
  );

  const vad = useMicVAD({
    startOnLoad: false,
    baseAssetPath: "/",
    onnxWASMBasePath: "/",
    positiveSpeechThreshold: 0.7,
    negativeSpeechThreshold: 0.45,
    redemptionMs: 500,
    minSpeechMs: 250,
    onSpeechEnd: (audio: Float32Array) => {
      const rms = calculateRMS(audio);
      if (rms < MIN_RMS_THRESHOLD) return;

      const durationMs = (audio.length / SAMPLE_RATE) * 1000;
      if (durationMs < MIN_DURATION_MS) return;

      // Fire immediately — no queue, parallel processing
      setProcessingCount((c) => c + 1);
      const speaker = speakerRef?.current || "";
      processAudio(audio, speaker);
    },
  });

  useEffect(() => {
    if (vad.errored) {
      setError(
        typeof vad.errored === "string"
          ? vad.errored
          : "VAD model failed to load"
      );
    }
  }, [vad.errored]);

  const start = useCallback(async () => {
    setError(null);
    abortControllerRef.current = new AbortController();
    await vad.start();
    setIsRecording(true);
  }, [vad]);

  const stop = useCallback(async () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    await vad.pause();
    setIsRecording(false);
    setProcessingCount(0);
  }, [vad]);

  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  return {
    transcripts,
    isRecording,
    isProcessing: processingCount > 0,
    isLoading: vad.loading,
    errored: !!vad.errored,
    error,
    start,
    stop,
    clearTranscripts,
  };
}
