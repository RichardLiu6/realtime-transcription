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
  });
  const [isRecording, setIsRecording] = useState(false);

  // Refs
  const connectionsRef = useRef<Map<ModelId, ModelConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

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
              audio_format: "pcm",
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
          if (event.code !== 1000) {
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

  // Handle Soniox transcription messages
  const handleSonioxMessage = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any, _connectStart: number) => {
      // Soniox sends words array with is_final flag
      if (data.words && Array.isArray(data.words)) {
        const conn = connectionsRef.current.get("soniox");

        // Track first word
        if (
          conn &&
          !conn.firstWordReceived &&
          data.words.length > 0
        ) {
          conn.firstWordReceived = true;
          const firstWordMs = Math.round(
            performance.now() - recordingStartTimeRef.current
          );
          updateMetrics("soniox", { firstWordMs });
        }

        // Build text from words
        const text = data.words
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((w: any) => w.text)
          .join("");

        if (data.is_final) {
          // Final segment
          if (text.trim()) {
            setModels((prev) => {
              const current = prev.soniox;
              const newTranscript = current.transcript
                ? current.transcript + " " + text.trim()
                : text.trim();
              const newSegments = [
                ...current.metrics.finalSegments,
                text.trim(),
              ];
              return {
                ...prev,
                soniox: {
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
          }
        } else {
          // Partial/interim
          updateModel("soniox", { interimText: text });
        }
      }

      // Handle errors from Soniox
      if (data.error) {
        updateModel("soniox", { error: data.error });
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
          const connectionMs = Math.round(performance.now() - connectStart);
          updateMetrics(modelId, { connectionMs });
          updateModel(modelId, { isConnected: true, error: null });
          resolve(ws);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error(`${modelId} WebSocket error`));
        };

        ws.onclose = (event) => {
          clearTimeout(timeout);
          if (event.code !== 1000) {
            updateModel(modelId, {
              isConnected: false,
              error: `Disconnected: ${event.code}`,
            });
          } else {
            updateModel(modelId, { isConnected: false });
          }
        };

        // Handle OpenAI messages
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
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

            // Distribute to all connected models
            connectionsRef.current.forEach((conn) => {
              if (conn.ws.readyState !== WebSocket.OPEN) return;

              if (conn.modelId === "soniox") {
                // Soniox: binary PCM16 frames
                const pcmBuffer = float32ToInt16Buffer(samples);
                conn.ws.send(pcmBuffer);
              } else {
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

        // Connect all selected models in parallel
        const connectionPromises = selectedModels.map(
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
      updateModel,
    ]
  );

  // Stop recording
  const stop = useCallback(() => {
    // Close all WebSocket connections
    connectionsRef.current.forEach((conn) => {
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
  }, []);

  // Clear all results
  const clear = useCallback(() => {
    setModels({
      soniox: createEmptyResult(),
      "gpt-4o-transcribe": createEmptyResult(),
      "gpt-4o-mini-transcribe": createEmptyResult(),
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      connectionsRef.current.forEach((conn) => conn.ws.close());
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
