"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSonioxTranscription } from "@/hooks/useSonioxTranscription";
import { useSpeakerManager } from "@/hooks/useSpeakerManager";
import { triggerBilingualDownload } from "@/lib/exportBilingual";
import type { SonioxConfig } from "@/types/bilingual";
import PreRecordingView from "@/components/PreRecordingView";
import RecordingTopBar from "@/components/RecordingTopBar";
import BilingualDisplay from "@/components/BilingualDisplay";
import SpeakerBar from "@/components/SpeakerBar";

export default function Home() {
  const {
    entries,
    recordingState,
    error,
    elapsedSeconds,
    config,
    start,
    stop,
    clearEntries,
  } = useSonioxTranscription();

  const {
    speakers,
    registerSpeaker,
    renameSpeaker,
    clearSpeakers,
  } = useSpeakerManager();

  // Track active context terms count
  const termsCountRef = useRef(0);

  // Auto-register speakers from entries
  useEffect(() => {
    for (const entry of entries) {
      registerSpeaker(entry.speaker);
    }
  }, [entries, registerSpeaker]);

  const handleStart = useCallback(
    (config: SonioxConfig) => {
      termsCountRef.current = config.contextTerms.length;
      clearEntries();
      clearSpeakers();
      start(config);
    },
    [start, clearEntries, clearSpeakers]
  );

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleExport = useCallback(() => {
    triggerBilingualDownload(entries);
  }, [entries]);

  const handleRenameSpeaker = useCallback(
    (speakerId: string, newLabel: string) => {
      renameSpeaker(speakerId, newLabel);
    },
    [renameSpeaker]
  );

  const isRecording = recordingState === "recording";
  const isConnecting = recordingState === "connecting";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Error banner */}
      {error && (
        <div className="shrink-0 bg-red-50 px-4 py-2 text-center text-sm text-red-500">
          {error}
        </div>
      )}

      {recordingState === "idle" && entries.length === 0 ? (
        /* Pre-recording view */
        <PreRecordingView onStart={handleStart} isConnecting={isConnecting} />
      ) : (
        <>
          {/* Recording top bar (visible when recording or has entries) */}
          {(isRecording || isConnecting) && (
            <RecordingTopBar
              onStop={handleStop}
              elapsedSeconds={elapsedSeconds}
              termsCount={termsCountRef.current}
              onExport={handleExport}
            />
          )}

          {/* Stopped but has entries - show a minimal bar */}
          {recordingState === "idle" && entries.length > 0 && (
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    clearEntries();
                    clearSpeakers();
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50"
                >
                  新会议
                </button>
                <span className="text-xs text-gray-400">
                  {entries.filter((e) => e.isFinal).length} 条记录
                </span>
              </div>
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                导出
              </button>
            </div>
          )}

          {/* Main transcript display */}
          <div className="flex min-h-0 flex-1 flex-col">
            <BilingualDisplay
              entries={entries}
              speakers={speakers}
              isRecording={isRecording}
              config={config}
            />
          </div>

          {/* Speaker bar */}
          <SpeakerBar
            speakers={speakers}
            onRenameSpeaker={handleRenameSpeaker}
          />
        </>
      )}
    </div>
  );
}
