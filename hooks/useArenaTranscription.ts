"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ModelId, ModelResult } from "@/types/arena";

const TARGET_SAMPLE_RATE = 24000;

// AudioWorklet processor code (shared across all models)
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
registerProcessor('arena-pcm-processor', PCMProcessor);
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

// Convert Float32 samples to Int16 ArrayBuffer (for Soniox binary frames)
function float32ToInt16Buffer(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function createEmptyResult(): ModelResult {
  return {
    transcript: "",
    interimText: "",
    isConnected: false,
    error: null,
    metrics: {
      firstWordMs: 0,
      connectionMs: 0,
      totalWords: 0,
      finalSegments: [],
    },
  };
}

interface ModelConnection {
  ws: WebSocket;
  modelId: ModelId;
  connectTime: number;
  firstWordReceived: boolean;
}

export function useArenaTranscription() {
  const [models, setModels] = useState<Record<ModelId, ModelResult>>({
    soniox: createEmptyResult(),
    "gpt-4o-transcribe": createEmptyResult(),
    "gpt-4o-mini-transcribe": createEmptyResult(),
    "groq-whisper-large-v3": createEmptyResult(),
    "groq-whisper-large-v3-turbo": createEmptyResult(),
  });
  const [isRecording, setIsRecording] = useState(false);

  // Refs
  const connectionsRef = useRef<Map<ModelId, ModelConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const stoppingRef = useRef(false); // Track intentional stop

  // Groq audio buffer: accumulate Float32 samples, send periodically
  const groqAudioBufferRef = useRef<Float32Array[]>([]);
  const groqTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const groqActiveModelsRef = useRef<Set<ModelId>>(new Set());

  // Update a single model's result
  const updateModel = useCallback(
    (modelId: ModelId, update: Partial<ModelResult>) => {
      setModels((prev) => ({
        ...prev,
        [modelId]: { ...prev[modelId], ...update },
      }));
    },
    []
  );

  // Update model metrics
  const updateMetrics = useCallback(
    (
      modelId: ModelId,
      metricUpdate: Partial<ModelResult["metrics"]>
    ) => {
      setModels((prev) => ({
        ...prev,
        [modelId]: {
          ...prev[modelId],
          metrics: { ...prev[modelId].metrics, ...metricUpdate },
        },
      }));
    },
    []
  );

  // Get token for a model
  const getToken = useCallback(
    async (
      provider: "soniox" | "openai",
      model: string
    ): Promise<string> => {
      const res = await fetch("/api/arena/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Token request failed for ${model}`);
      }
      const data = await res.json();
      return data.token;
    },
    []
  );

  // Connect Soniox WebSocket
  const connectSoniox = useCallback(
    async (token: string): Promise<WebSocket> => {
      const connectStart = performance.now();

      const ws = new WebSocket(
        "wss://stt-rt.soniox.com/transcribe-websocket"
      );

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("Soniox connection timeout"));
        }, 10000);

        ws.onopen = () => {
          clearTimeout(timeout);
          const connectionMs = Math.round(performance.now() - connectStart);
          updateMetrics("soniox", { connectionMs });

          // Send initial config
          ws.send(
            JSON.stringify({
              api_key: token,
              model: "stt-rt-preview",
              audio_format: "pcm_s16le",
              sample_rate: 24000,
              num_channels: 1,
              enable_endpoint_detection: true,
              language_hints: ["zh", "en", "es"],
            })
          );

          updateModel("soniox", { isConnected: true, error: null });
          resolve(ws);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Soniox WebSocket error"));
        };

        ws.onclose = (event) => {
          clearTimeout(timeout);
          // Don't show error for intentional stop or normal close codes
          if (!stoppingRef.current && event.code !== 1000 && event.code !== 1005) {
            updateModel("soniox", {
              isConnected: false,
              error: `Disconnected: ${event.code}`,
            });
          } else {
            updateModel("soniox", { isConnected: false });
          }
        };

        // Handle Soniox messages
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleSonioxMessage(data, connectStart);
          } catch {
            // ignore non-JSON
          }
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Accumulated final tokens for Soniox (final tokens are sent once, non-final reset each message)
  const sonioxFinalTokensRef = useRef<string[]>([]);

  // Handle Soniox transcription messages
  const handleSonioxMessage = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any, _connectStart: number) => {
      // Soniox returns tokens array (not words)
      // Each token has { text, is_final, start_ms, end_ms, confidence, ... }
      // Final tokens (is_final=true) are returned once → accumulate them
      // Non-final tokens (is_final=false) update each message → reset each time
      if (data.tokens && Array.isArray(data.tokens)) {
        const conn = connectionsRef.current.get("soniox");

        // Track first word
        if (
          conn &&
          !conn.firstWordReceived &&
          data.tokens.some((t: { text?: string }) => t.text)
        ) {
          conn.firstWordReceived = true;
          const firstWordMs = Math.round(
            performance.now() - recordingStartTimeRef.current
          );
          updateMetrics("soniox", { firstWordMs });
        }

        // Separate final and non-final tokens
        const newFinalTexts: string[] = [];
        const nonFinalTexts: string[] = [];

        for (const token of data.tokens) {
          if (!token.text) continue;
          if (token.is_final) {
            newFinalTexts.push(token.text);
          } else {
            nonFinalTexts.push(token.text);
          }
        }

        // Append new final tokens to accumulated list
        if (newFinalTexts.length > 0) {
          sonioxFinalTokensRef.current.push(...newFinalTexts);
        }

        // Build full transcript from all accumulated final tokens
        const finalText = sonioxFinalTokensRef.current.join("");
        // Non-final tokens are the current interim
        const interimText = nonFinalTexts.join("");

        setModels((prev) => {
          const current = prev.soniox;
          const trimmedFinal = finalText.trim();
          return {
            ...prev,
            soniox: {
              ...current,
              transcript: trimmedFinal,
              interimText: interimText,
              metrics: {
                ...current.metrics,
                totalWords: trimmedFinal
                  ? trimmedFinal.split(/\s+/).filter(Boolean).length
                  : 0,
                finalSegments: trimmedFinal ? [trimmedFinal] : [],
              },
            },
          };
        });
      }

      // Handle errors from Soniox
      if (data.error_code || data.error_message) {
        updateModel("soniox", {
          error: data.error_message || `Error code: ${data.error_code}`,
        });
      }

      // Session finished
      if (data.finished) {
        console.log("[Soniox] Session finished");
      }
    },
    [updateModel, updateMetrics]
  );

  // Connect OpenAI WebSocket
  const connectOpenAI = useCallback(
    async (
      modelId: "gpt-4o-transcribe" | "gpt-4o-mini-transcribe",
      token: string
    ): Promise<WebSocket> => {
      const connectStart = performance.now();

      const wsUrl =
        "wss://api.openai.com/v1/realtime?intent=transcription";
      const ws = new WebSocket(wsUrl, [
        "realtime",
        `openai-insecure-api-key.${token}`,
      ]);

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error(`${modelId} connection timeout`));
        }, 10000);

        ws.onopen = () => {
          clearTimeout(timeout);
          console.log(`[Arena ${modelId}] WebSocket connected`);
          const connectionMs = Math.round(performance.now() - connectStart);
          updateMetrics(modelId, { connectionMs });
          updateModel(modelId, { isConnected: true, error: null });
          resolve(ws);
        };

        ws.onerror = (err) => {
          clearTimeout(timeout);
          console.error(`[Arena ${modelId}] WebSocket error:`, err);
          reject(new Error(`${modelId} WebSocket error`));
        };

        ws.onclose = (event) => {
          clearTimeout(timeout);
          console.log(`[Arena ${modelId}] WebSocket closed: ${event.code} ${event.reason}`);
          // Don't show error for intentional stop or normal close codes
          if (!stoppingRef.current && event.code !== 1000 && event.code !== 1005) {
            updateModel(modelId, {
              isConnected: false,
              error: `Disconnected: ${event.code} ${event.reason}`,
            });
          } else {
            updateModel(modelId, { isConnected: false });
          }
        };

        // Handle OpenAI messages
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // Debug: log all event types
            console.log(`[Arena ${modelId}] Event:`, data.type, data.delta?.slice?.(0, 30) || "");
            handleOpenAIMessage(modelId, data);
          } catch {
            // ignore non-JSON
          }
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Handle OpenAI transcription events
  const handleOpenAIMessage = useCallback(
    (
      modelId: "gpt-4o-transcribe" | "gpt-4o-mini-transcribe",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      event: any
    ) => {
      switch (event.type) {
        case "conversation.item.input_audio_transcription.delta": {
          if (!event.delta) break;
          const conn = connectionsRef.current.get(modelId);

          // Track first word
          if (conn && !conn.firstWordReceived) {
            conn.firstWordReceived = true;
            const firstWordMs = Math.round(
              performance.now() - recordingStartTimeRef.current
            );
            updateMetrics(modelId, { firstWordMs });
          }

          // Accumulate interim text
          setModels((prev) => {
            const current = prev[modelId];
            const newInterim = (current.interimText || "") + event.delta;
            return {
              ...prev,
              [modelId]: { ...current, interimText: newInterim },
            };
          });
          break;
        }

        case "conversation.item.input_audio_transcription.completed": {
          const transcript = event.transcript?.trim();
          if (!transcript || transcript.length < 2) {
            // Clear interim for very short/empty transcripts
            updateModel(modelId, { interimText: "" });
            break;
          }

          setModels((prev) => {
            const current = prev[modelId];
            const newTranscript = current.transcript
              ? current.transcript + " " + transcript
              : transcript;
            const newSegments = [
              ...current.metrics.finalSegments,
              transcript,
            ];
            return {
              ...prev,
              [modelId]: {
                ...current,
                transcript: newTranscript,
                interimText: "",
                metrics: {
                  ...current.metrics,
                  totalWords: newTranscript.split(/\s+/).filter(Boolean)
                    .length,
                  finalSegments: newSegments,
                },
              },
            };
          });
          break;
        }

        case "error": {
          console.error(`[Arena ${modelId}] Error:`, event);
          updateModel(modelId, {
            error: event.error?.message || "Realtime API error",
          });
          break;
        }
      }
    },
    [updateModel, updateMetrics]
  );

  // Send pre-encoded base64 audio to Groq REST API for a specific model
  const sendGroqChunk = useCallback(
    async (modelId: ModelId, base64Audio: string) => {
      const groqModel =
        modelId === "groq-whisper-large-v3"
          ? "whisper-large-v3"
          : "whisper-large-v3-turbo";

      try {
        const res = await fetch("/api/arena/groq-transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: base64Audio, model: groqModel }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error(`[Groq ${modelId}] Error:`, err);
          return;
        }

        const data = await res.json();
        const text = data.text?.trim();
        if (!text) return;

        // Track first word
        const conn = connectionsRef.current.get(modelId);
        if (conn && !conn.firstWordReceived) {
          conn.firstWordReceived = true;
          const firstWordMs = Math.round(
            performance.now() - recordingStartTimeRef.current
          );
          updateMetrics(modelId, { firstWordMs });
        }

        // Append to transcript
        setModels((prev) => {
          const current = prev[modelId];
          const newTranscript = current.transcript
            ? current.transcript + " " + text
            : text;
          return {
            ...prev,
            [modelId]: {
              ...current,
              transcript: newTranscript,
              interimText: "",
              metrics: {
                ...current.metrics,
                totalWords: newTranscript.split(/\s+/).filter(Boolean).length,
                finalSegments: [...current.metrics.finalSegments, text],
              },
            },
          };
        });
      } catch (err) {
        console.error(`[Groq ${modelId}] Fetch error:`, err);
      }
    },
    [updateMetrics]
  );

  // Drain buffer and send to a specific Groq model
  const flushGroqBuffer = useCallback(
    (modelId: ModelId) => {
      const chunks = groqAudioBufferRef.current;
      if (chunks.length === 0) return;

      const allChunks = [...chunks];
      const totalLen = allChunks.reduce((sum, c) => sum + c.length, 0);
      if (totalLen === 0) return;

      const merged = new Float32Array(totalLen);
      let offset = 0;
      for (const chunk of allChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const base64Audio = float32ToBase64PCM16(merged);
      sendGroqChunk(modelId, base64Audio);
    },
    [sendGroqChunk]
  );

  // Start Groq periodic send timer
  const startGroqTimer = useCallback(
    (groqModelIds: ModelId[]) => {
      groqActiveModelsRef.current = new Set(groqModelIds);
      // Show "recording" indicator
      for (const id of groqModelIds) {
        updateModel(id, { isConnected: true, error: null });
      }

      // Send every 3 seconds — drain buffer once and send to all Groq models
      groqTimerRef.current = setInterval(() => {
        const chunks = groqAudioBufferRef.current;
        if (chunks.length === 0) return;

        // Drain the buffer once
        const allChunks = chunks.splice(0, chunks.length);
        const totalLen = allChunks.reduce((sum, c) => sum + c.length, 0);
        if (totalLen === 0) return;

        // Merge into single Float32Array
        const merged = new Float32Array(totalLen);
        let offset = 0;
        for (const chunk of allChunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }

        // Convert to base64 PCM16 once, send to all Groq models
        const base64Audio = float32ToBase64PCM16(merged);
        for (const id of groqActiveModelsRef.current) {
          sendGroqChunk(id, base64Audio);
        }
      }, 3000);
    },
    [sendGroqChunk, updateModel]
  );

  // Stop Groq timer and send remaining audio
  const stopGroqTimer = useCallback(() => {
    if (groqTimerRef.current) {
      clearInterval(groqTimerRef.current);
      groqTimerRef.current = null;
    }

    // Send remaining buffered audio to all active Groq models
    for (const id of groqActiveModelsRef.current) {
      flushGroqBuffer(id);
      updateModel(id, { isConnected: false });
    }
    groqActiveModelsRef.current.clear();
    groqAudioBufferRef.current = [];
  }, [flushGroqBuffer, updateModel]);

  // Start audio capture and distribute to all models
  const startAudioCapture = useCallback(
    (stream: MediaStream) => {
      const audioContext = new AudioContext({
        sampleRate: TARGET_SAMPLE_RATE,
      });
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
            "arena-pcm-processor"
          );
          workletNodeRef.current = workletNode;

          workletNode.port.onmessage = (
            event: MessageEvent<Float32Array>
          ) => {
            let samples = event.data;

            // Resample if needed
            if (audioContext.sampleRate !== TARGET_SAMPLE_RATE) {
              samples = resampleAudio(
                samples,
                audioContext.sampleRate,
                TARGET_SAMPLE_RATE
              );
            }

            // Buffer audio for Groq models
            if (groqActiveModelsRef.current.size > 0) {
              groqAudioBufferRef.current.push(new Float32Array(samples));
            }

            // Distribute to all connected WebSocket models
            connectionsRef.current.forEach((conn) => {
              if (conn.ws.readyState !== WebSocket.OPEN) return;

              if (conn.modelId === "soniox") {
                // Soniox: binary PCM16 frames
                const pcmBuffer = float32ToInt16Buffer(samples);
                conn.ws.send(pcmBuffer);
              } else if (
                conn.modelId === "gpt-4o-transcribe" ||
                conn.modelId === "gpt-4o-mini-transcribe"
              ) {
                // OpenAI: base64 JSON
                const base64Audio = float32ToBase64PCM16(samples);
                conn.ws.send(
                  JSON.stringify({
                    type: "input_audio_buffer.append",
                    audio: base64Audio,
                  })
                );
              }
            });
          };

          source.connect(workletNode);
          workletNode.connect(audioContext.destination);
        })
        .catch((err) => {
          URL.revokeObjectURL(workletUrl);
          console.error("AudioWorklet setup failed:", err);
        });
    },
    []
  );

  // Start recording with selected models
  const start = useCallback(
    async (selectedModels: ModelId[]) => {
      if (selectedModels.length === 0) return;

      // Reset all selected models
      stoppingRef.current = false;
      sonioxFinalTokensRef.current = [];
      for (const modelId of selectedModels) {
        updateModel(modelId, createEmptyResult());
      }

      try {
        // Get microphone
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: TARGET_SAMPLE_RATE,
          },
        });
        mediaStreamRef.current = stream;

        recordingStartTimeRef.current = performance.now();

        // Separate WebSocket models from Groq REST models
        const wsModels = selectedModels.filter(
          (id) =>
            id === "soniox" ||
            id === "gpt-4o-transcribe" ||
            id === "gpt-4o-mini-transcribe"
        );
        const groqModels = selectedModels.filter(
          (id) =>
            id === "groq-whisper-large-v3" ||
            id === "groq-whisper-large-v3-turbo"
        );

        // Connect WebSocket models in parallel
        const connectionPromises = wsModels.map(
          async (modelId) => {
            try {
              const provider =
                modelId === "soniox" ? "soniox" : "openai";
              const token = await getToken(provider, modelId);

              let ws: WebSocket;
              if (modelId === "soniox") {
                ws = await connectSoniox(token);
              } else {
                ws = await connectOpenAI(
                  modelId as
                    | "gpt-4o-transcribe"
                    | "gpt-4o-mini-transcribe",
                  token
                );
              }

              connectionsRef.current.set(modelId, {
                ws,
                modelId,
                connectTime: performance.now(),
                firstWordReceived: false,
              });
            } catch (err) {
              updateModel(modelId, {
                error:
                  err instanceof Error
                    ? err.message
                    : "Connection failed",
                isConnected: false,
              });
            }
          }
        );

        await Promise.allSettled(connectionPromises);

        // Start Groq models (REST-based, use timer)
        if (groqModels.length > 0) {
          // Create dummy connections for first-word tracking
          for (const id of groqModels) {
            connectionsRef.current.set(id, {
              ws: null as unknown as WebSocket,
              modelId: id,
              connectTime: performance.now(),
              firstWordReceived: false,
            });
            updateMetrics(id, {
              connectionMs: Math.round(
                performance.now() - recordingStartTimeRef.current
              ),
            });
          }
          startGroqTimer(groqModels);
        }

        // Start audio capture (sends to all connected models)
        startAudioCapture(stream);
        setIsRecording(true);
      } catch (err) {
        console.error("Failed to start arena:", err);
        // Clean up on failure
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    },
    [
      getToken,
      connectSoniox,
      connectOpenAI,
      startAudioCapture,
      startGroqTimer,
      updateModel,
      updateMetrics,
    ]
  );

  // Stop recording
  const stop = useCallback(() => {
    stoppingRef.current = true;

    // Stop Groq timer first (sends remaining audio)
    stopGroqTimer();

    // Close all WebSocket connections
    connectionsRef.current.forEach((conn) => {
      // Skip Groq dummy connections (no real WebSocket)
      if (
        conn.modelId === "groq-whisper-large-v3" ||
        conn.modelId === "groq-whisper-large-v3-turbo"
      ) {
        return;
      }
      if (conn.modelId === "soniox" && conn.ws.readyState === WebSocket.OPEN) {
        // Soniox: send empty binary frame to signal end
        conn.ws.send(new ArrayBuffer(0));
      }
      conn.ws.close();
    });
    connectionsRef.current.clear();

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

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    setIsRecording(false);

    // Mark all as disconnected
    setModels((prev) => {
      const updated = { ...prev };
      for (const key of Object.keys(updated) as ModelId[]) {
        updated[key] = { ...updated[key], isConnected: false };
      }
      return updated;
    });
  }, [stopGroqTimer]);

  // Clear all results
  const clear = useCallback(() => {
    sonioxFinalTokensRef.current = [];
    groqAudioBufferRef.current = [];
    setModels({
      soniox: createEmptyResult(),
      "gpt-4o-transcribe": createEmptyResult(),
      "gpt-4o-mini-transcribe": createEmptyResult(),
      "groq-whisper-large-v3": createEmptyResult(),
      "groq-whisper-large-v3-turbo": createEmptyResult(),
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (groqTimerRef.current) {
        clearInterval(groqTimerRef.current);
        groqTimerRef.current = null;
      }
      connectionsRef.current.forEach((conn) => {
        // Skip Groq dummy connections
        if (
          conn.modelId === "groq-whisper-large-v3" ||
          conn.modelId === "groq-whisper-large-v3-turbo"
        )
          return;
        conn.ws.close();
      });
      connectionsRef.current.clear();
      workletNodeRef.current?.disconnect();
      audioContextRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    models,
    isRecording,
    start,
    stop,
    clear,
  };
}
