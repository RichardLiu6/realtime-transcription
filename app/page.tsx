"use client";

import { useVADTranscription } from "@/hooks/useVADTranscription";
import RecordButton from "@/components/RecordButton";
import TranscriptDisplay from "@/components/TranscriptDisplay";
import Toolbar from "@/components/Toolbar";

export default function Home() {
  const {
    transcripts,
    isRecording,
    isProcessing,
    isLoading,
    error,
    start,
    stop,
    clearTranscripts,
  } = useVADTranscription();

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-3xl flex flex-col gap-6 flex-1">
        {/* Header */}
        <header className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            实时语音转文字
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            支持中文 / English / Espanol 混合识别
          </p>
        </header>

        {/* Record Button */}
        <div className="flex justify-center">
          <RecordButton
            isRecording={isRecording}
            isLoading={isLoading}
            onStart={start}
            onStop={stop}
          />
        </div>

        {/* Processing indicator */}
        {isProcessing && (
          <div className="text-center text-sm text-gray-500">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 bg-blue-500 rounded-full listening-dot" />
              <span className="w-2 h-2 bg-blue-500 rounded-full listening-dot" />
              <span className="w-2 h-2 bg-blue-500 rounded-full listening-dot" />
              <span className="ml-2">正在转录...</span>
            </span>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="text-center text-sm text-red-500 bg-red-50 rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        {/* Toolbar */}
        <Toolbar entries={transcripts} onClear={clearTranscripts} />

        {/* Transcript Display */}
        <div className="flex-1 min-h-[300px] flex flex-col">
          <TranscriptDisplay
            entries={transcripts}
            isRecording={isRecording}
          />
        </div>
      </div>
    </div>
  );
}
