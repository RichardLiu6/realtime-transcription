"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Paragraph } from "@/types";

// --------------- Deepgram message types ---------------
interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  speaker?: number;
  confidence: number;
}

interface DeepgramResult {
  type: "Results";
  channel: {
    alternatives: Array<{
      transcript: string;
      confidence: number;
      words: DeepgramWord[];
    }>;
    detected_language?: string;
  };
  is_final: boolean;
  speech_final: boolean;
}

interface DeepgramUtteranceEnd {
  type: "UtteranceEnd";
}

type DeepgramMessage = DeepgramResult | DeepgramUtteranceEnd | { type: string };

// --------------- Constants ---------------
const WS_BASE = "wss://api.deepgram.com/v1/listen";
const CHUNK_INTERVAL_MS = 250;
const KEEPALIVE_INTERVAL_MS = 8000;

// --------------- Hook ---------------
export function useDeepgramTranscription(primaryLang: string) {
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Current paragraph being built (mutable for performance)
  const currentParaRef = useRef<{
    id: string;
    text: string;
    speaker: number;
    language: string;
    startTime: Date;
  } | null>(null);

  // Ref to latest primaryLang for use inside callbacks
  const primaryLangRef = useRef(primaryLang);
  useEffect(() => {
    primaryLangRef.current = primaryLang;
  }, [primaryLang]);

  // --------------- Translate a finalized paragraph ---------------
  const translateParagraph = useCallback(
    async (paraId: string, text: string, language: string) => {
      // Mark as translating
      setParagraphs((prev) =>
        prev.map((p) => (p.id === paraId ? { ...p, isTranslating: true } : p))
      );

      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, detectedLang: language }),
        });
        const data = await res.json();
        if (data.translations) {
          setParagraphs((prev) =>
            prev.map((p) =>
              p.id === paraId
                ? { ...p, translations: data.translations, isTranslating: false }
                : p
            )
          );
        }
      } catch {
        setParagraphs((prev) =>
          prev.map((p) =>
            p.id === paraId ? { ...p, isTranslating: false } : p
          )
        );
      }
    },
    []
  );

  // --------------- Finalize current paragraph ---------------
  const finalizeParagraph = useCallback(() => {
    const para = currentParaRef.current;
    if (!para || !para.text.trim()) {
      currentParaRef.current = null;
      return;
    }

    const paraId = para.id;
    const text = para.text.trim();
    const language = para.language;

    // Clear interim text and mark finalized
    setParagraphs((prev) =>
      prev.map((p) => (p.id === paraId ? { ...p, interimText: "" } : p))
    );

    currentParaRef.current = null;

    // Trigger translation
    translateParagraph(paraId, text, language);
  }, [translateParagraph]);

  // --------------- Handle Deepgram messages ---------------
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      let data: DeepgramMessage;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "Results") {
        const result = data as DeepgramResult;
        const alt = result.channel.alternatives[0];
        if (!alt) return;

        const transcript = alt.transcript;
        if (!transcript) return;

        const words = alt.words || [];
        const speaker =
          words.length > 0 && words[0].speaker !== undefined
            ? words[0].speaker
            : -1;
        const detectedLang =
          result.channel.detected_language || primaryLangRef.current;

        if (!result.is_final) {
          // --- Interim result: update display ---
          if (currentParaRef.current) {
            const paraId = currentParaRef.current.id;
            setParagraphs((prev) =>
              prev.map((p) =>
                p.id === paraId ? { ...p, interimText: transcript } : p
              )
            );
          } else {
            // No current paragraph yet — create one
            const newPara: Paragraph = {
              id: crypto.randomUUID(),
              text: "",
              interimText: transcript,
              speaker: speaker >= 0 ? speaker : 0,
              language: detectedLang,
              startTime: new Date(),
              translations: { zh: "", en: "", es: "" },
              isTranslating: false,
            };
            currentParaRef.current = {
              id: newPara.id,
              text: "",
              speaker: newPara.speaker,
              language: detectedLang,
              startTime: newPara.startTime,
            };
            setParagraphs((prev) => [...prev, newPara]);
          }
        } else {
          // --- Final result: append text ---
          const speakerChanged =
            currentParaRef.current &&
            speaker >= 0 &&
            currentParaRef.current.speaker >= 0 &&
            speaker !== currentParaRef.current.speaker;

          if (speakerChanged && currentParaRef.current?.text.trim()) {
            // Different speaker — finalize old paragraph first
            finalizeParagraph();
          }

          if (!currentParaRef.current) {
            // Start a new paragraph
            const newPara: Paragraph = {
              id: crypto.randomUUID(),
              text: transcript,
              interimText: "",
              speaker: speaker >= 0 ? speaker : 0,
              language: detectedLang,
              startTime: new Date(),
              translations: { zh: "", en: "", es: "" },
              isTranslating: false,
            };
            currentParaRef.current = {
              id: newPara.id,
              text: transcript,
              speaker: newPara.speaker,
              language: detectedLang,
              startTime: newPara.startTime,
            };
            setParagraphs((prev) => [...prev, newPara]);
          } else {
            // Append to existing paragraph
            const separator = currentParaRef.current.text ? " " : "";
            currentParaRef.current.text += separator + transcript;
            currentParaRef.current.language = detectedLang;
            const paraId = currentParaRef.current.id;
            const newText = currentParaRef.current.text;
            setParagraphs((prev) =>
              prev.map((p) =>
                p.id === paraId
                  ? { ...p, text: newText, interimText: "", language: detectedLang }
                  : p
              )
            );
          }

          // speech_final means endpoint detected — finalize this paragraph
          if (result.speech_final) {
            finalizeParagraph();
          }
        }
      } else if (data.type === "UtteranceEnd") {
        // Long silence — finalize paragraph
        finalizeParagraph();
      }
    },
    [finalizeParagraph]
  );

  // --------------- Start ---------------
  const start = useCallback(async () => {
    setError(null);
    setIsConnecting(true);

    try {
      // 1. Get temp token
      const tokenRes = await fetch("/api/deepgram-token");
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.token) {
        throw new Error(tokenData.error || "Failed to get Deepgram token");
      }

      // 2. Build WebSocket URL
      const params = new URLSearchParams({
        model: "nova-3",
        language: primaryLangRef.current,
        smart_format: "true",
        diarize: "true",
        interim_results: "true",
        utterance_end_ms: "1500",
        vad_events: "true",
        endpointing: "500",
        punctuate: "true",
      });

      const ws = new WebSocket(
        `${WS_BASE}?${params.toString()}&token=${tokenData.token}`
      );
      wsRef.current = ws;

      ws.onopen = async () => {
        try {
          // 3. Start microphone
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              sampleRate: 16000,
              echoCancellation: true,
              noiseSuppression: true,
            },
          });
          streamRef.current = stream;

          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (event) => {
            if (
              event.data.size > 0 &&
              ws.readyState === WebSocket.OPEN
            ) {
              ws.send(event.data);
            }
          };

          mediaRecorder.start(CHUNK_INTERVAL_MS);

          // 4. Keep-alive
          keepAliveRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "KeepAlive" }));
            }
          }, KEEPALIVE_INTERVAL_MS);

          setIsRecording(true);
          setIsConnecting(false);
        } catch (micErr) {
          setError(
            micErr instanceof Error
              ? micErr.message
              : "Microphone access denied"
          );
          setIsConnecting(false);
          ws.close();
        }
      };

      ws.onmessage = handleMessage;

      ws.onerror = () => {
        setError("WebSocket connection error");
        setIsConnecting(false);
      };

      ws.onclose = () => {
        setIsRecording(false);
        setIsConnecting(false);
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setIsConnecting(false);
    }
  }, [handleMessage]);

  // --------------- Stop ---------------
  const stop = useCallback(() => {
    // Stop MediaRecorder
    if (mediaRecorderRef.current?.state !== "inactive") {
      try {
        mediaRecorderRef.current?.stop();
      } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;

    // Stop mic tracks
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Clear keepalive
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }

    // Close WebSocket gracefully
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "CloseStream" }));
      wsRef.current.close();
    }
    wsRef.current = null;

    // Finalize any open paragraph
    finalizeParagraph();

    setIsRecording(false);
  }, [finalizeParagraph]);

  // --------------- Clear ---------------
  const clearParagraphs = useCallback(() => {
    setParagraphs([]);
    currentParaRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state !== "inactive") {
        try { mediaRecorderRef.current?.stop(); } catch { /* */ }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    paragraphs,
    isRecording,
    isConnecting,
    error,
    start,
    stop,
    clearParagraphs,
  };
}
