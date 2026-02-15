"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useArenaTranscription } from "@/hooks/useArenaTranscription";
import type { ModelId, ModelConfig } from "@/types/arena";
import { MODEL_CONFIGS } from "@/types/arena";

const COLOR_MAP: Record<string, { bg: string; border: string; dot: string; text: string }> = {
  purple: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    dot: "bg-purple-500",
    text: "text-purple-700",
  },
  green: {
    bg: "bg-green-50",
    border: "border-green-200",
    dot: "bg-green-500",
    text: "text-green-700",
  },
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    dot: "bg-blue-500",
    text: "text-blue-700",
  },
};

function StatusDot({
  isConnected,
  isRecording,
  error,
}: {
  isConnected: boolean;
  isRecording: boolean;
  error: string | null;
}) {
  if (error) {
    return <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />;
  }
  if (isConnected && isRecording) {
    return (
      <span className="w-2.5 h-2.5 rounded-full bg-green-500 recording-pulse shrink-0" />
    );
  }
  if (isConnected) {
    return (
      <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse shrink-0" />
    );
  }
  return <span className="w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0" />;
}

function StatusLabel({
  isConnected,
  isRecording,
  error,
}: {
  isConnected: boolean;
  isRecording: boolean;
  error: string | null;
}) {
  if (error) return <span className="text-red-500">Error</span>;
  if (isConnected && isRecording) return <span className="text-green-600">Recording</span>;
  if (isConnected) return <span className="text-yellow-600">Connected</span>;
  return <span className="text-gray-400">Idle</span>;
}

function ModelColumn({
  config,
  transcript,
  interimText,
  isConnected,
  error,
  metrics,
  isRecording,
}: {
  config: ModelConfig;
  transcript: string;
  interimText: string;
  isConnected: boolean;
  error: string | null;
  metrics: { firstWordMs: number; connectionMs: number; totalWords: number };
  isRecording: boolean;
}) {
  const colors = COLOR_MAP[config.color] || COLOR_MAP.blue;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, interimText]);

  return (
    <div
      className={`flex flex-col border rounded-lg overflow-hidden ${colors.border} min-h-0`}
    >
      {/* Column header */}
      <div
        className={`shrink-0 px-3 py-2 ${colors.bg} border-b ${colors.border}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusDot
              isConnected={isConnected}
              isRecording={isRecording}
              error={error}
            />
            <span className={`text-sm font-medium ${colors.text}`}>
              {config.name}
            </span>
          </div>
          <span className="text-[10px] text-gray-400">
            <StatusLabel
              isConnected={isConnected}
              isRecording={isRecording}
              error={error}
            />
          </span>
        </div>
      </div>

      {/* Transcript content - scrollable */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto p-3 transcript-scroll"
      >
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : !transcript && !interimText ? (
          <p className="text-sm text-gray-300 italic">Waiting...</p>
        ) : (
          <div className="space-y-1">
            {transcript && (
              <p className="text-sm text-gray-900 font-medium leading-relaxed whitespace-pre-wrap">
                {transcript}
              </p>
            )}
            {interimText && (
              <p className="text-sm text-gray-400 leading-relaxed">
                {interimText}
                <span className="inline-block w-0.5 h-4 bg-gray-400 ml-0.5 align-text-bottom blink-cursor" />
              </p>
            )}
          </div>
        )}
      </div>

      {/* Metrics footer */}
      <div
        className={`shrink-0 px-3 py-1.5 ${colors.bg} border-t ${colors.border} flex items-center gap-3 text-[11px] text-gray-500`}
      >
        <span>
          Latency:{" "}
          <strong>
            {metrics.firstWordMs > 0 ? `${metrics.firstWordMs}ms` : "--"}
          </strong>
        </span>
        <span>
          Words: <strong>{metrics.totalWords}</strong>
        </span>
        <span>
          Conn:{" "}
          <strong>
            {metrics.connectionMs > 0
              ? `${metrics.connectionMs}ms`
              : "--"}
          </strong>
        </span>
      </div>
    </div>
  );
}

export default function ArenaPage() {
  const [selectedModels, setSelectedModels] = useState<Set<ModelId>>(
    new Set(MODEL_CONFIGS.map((c) => c.id))
  );
  const { models, isRecording, start, stop, clear } =
    useArenaTranscription();

  const toggleModel = useCallback(
    (modelId: ModelId) => {
      if (isRecording) return; // Can't change while recording
      setSelectedModels((prev) => {
        const next = new Set(prev);
        if (next.has(modelId)) {
          next.delete(modelId);
        } else {
          next.add(modelId);
        }
        return next;
      });
    },
    [isRecording]
  );

  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      stop();
    } else {
      start(Array.from(selectedModels));
    }
  }, [isRecording, start, stop, selectedModels]);

  const handleClear = useCallback(() => {
    if (isRecording) return;
    clear();
  }, [isRecording, clear]);

  // Filter to only show selected model columns
  const activeConfigs = MODEL_CONFIGS.filter((c) =>
    selectedModels.has(c.id)
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top control bar */}
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {/* Record button */}
          <button
            onClick={handleToggleRecording}
            disabled={selectedModels.size === 0}
            className="flex items-center gap-2 cursor-pointer disabled:opacity-40"
            title={isRecording ? "Stop recording" : "Start recording"}
          >
            <span
              className={`w-3.5 h-3.5 rounded-full transition-colors ${
                isRecording
                  ? "bg-red-500 recording-pulse"
                  : "bg-gray-400 hover:bg-gray-500"
              }`}
            />
            <span className="text-sm font-medium text-gray-700">
              {isRecording ? "Stop" : "Record"}
            </span>
          </button>

          <span className="text-gray-300">|</span>

          {/* Model selection checkboxes */}
          <div className="flex items-center gap-2">
            {MODEL_CONFIGS.map((config) => {
              const colors = COLOR_MAP[config.color] || COLOR_MAP.blue;
              const checked = selectedModels.has(config.id);
              return (
                <label
                  key={config.id}
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border cursor-pointer select-none transition-colors ${
                    checked
                      ? `${colors.bg} ${colors.border} ${colors.text}`
                      : "bg-gray-50 border-gray-200 text-gray-400"
                  } ${isRecording ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleModel(config.id)}
                    disabled={isRecording}
                    className="sr-only"
                  />
                  <span
                    className={`w-2 h-2 rounded-full ${
                      checked ? colors.dot : "bg-gray-300"
                    }`}
                  />
                  {config.name}
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">ASR Arena</span>
          <button
            onClick={handleClear}
            disabled={isRecording}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 cursor-pointer px-2 py-1"
          >
            Clear
          </button>
        </div>
      </header>

      {/* Model columns - main content area */}
      <div className="flex-1 min-h-0 p-3 gap-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {activeConfigs.length === 0 ? (
          <div className="col-span-full flex items-center justify-center text-gray-300">
            <p>Select at least one model to begin</p>
          </div>
        ) : (
          activeConfigs.map((config) => {
            const result = models[config.id];
            return (
              <ModelColumn
                key={config.id}
                config={config}
                transcript={result.transcript}
                interimText={result.interimText}
                isConnected={result.isConnected}
                error={result.error}
                metrics={result.metrics}
                isRecording={isRecording}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
