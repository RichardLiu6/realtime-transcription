"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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

export function useVADTranscription() {
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sequenceRef = useRef(0);

  const vad = useMicVAD({
    startOnLoad: false,
    baseAssetPath: "/",
    onnxWASMBasePath: "/",
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    redemptionMs: 300,
    minSpeechMs: 100,
    onSpeechEnd: (audio: Float32Array) => {
      sequenceRef.current++;

      requestQueueRef.current = requestQueueRef.current.then(async () => {
        try {
          setIsProcessing(true);

          const wavBlob = floatArrayToWav(audio, 16000);

          const formData = new FormData();
          formData.append("audio", wavBlob, "audio.wav");

          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => null);
            throw new Error(
              errData?.error || `Transcription failed: ${response.statusText}`
            );
          }

          const data = await response.json();

          if (data.text?.trim()) {
            const entry: TranscriptEntry = {
              id: crypto.randomUUID(),
              text: data.text,
              language: data.language || "unknown",
              timestamp: new Date(),
            };
            setTranscripts((prev) => [...prev, entry]);
          }
          setError(null);
        } catch (err) {
          console.error("Transcription error:", err);
          setError(
            err instanceof Error ? err.message : "Transcription failed"
          );
        } finally {
          setIsProcessing(false);
        }
      });
    },
  });

  // Surface VAD initialization errors
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
    await vad.start();
    setIsRecording(true);
  }, [vad]);

  const stop = useCallback(async () => {
    await vad.pause();
    setIsRecording(false);
  }, [vad]);

  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  return {
    transcripts,
    isRecording,
    isProcessing,
    isLoading: vad.loading,
    errored: !!vad.errored,
    error,
    start,
    stop,
    clearTranscripts,
  };
}
