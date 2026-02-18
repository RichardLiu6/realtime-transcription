"use client";

import type { TranslationMode, SpeakerInfo } from "@/types/bilingual";
import TranslationModeToggle from "@/components/sidebar/TranslationModeToggle";
import BetweenLanguages from "@/components/sidebar/BetweenLanguages";
import FromToLanguages from "@/components/sidebar/FromToLanguages";
import TermsPanel from "@/components/sidebar/TermsPanel";
import SpeakerPanel from "@/components/sidebar/SpeakerPanel";
import AudioWaveButton from "@/components/sidebar/AudioWaveButton";

interface SidebarProps {
  translationMode: TranslationMode;
  onTranslationModeChange: (mode: TranslationMode) => void;
  languageA: string;
  languageB: string;
  onLanguageAChange: (code: string) => void;
  onLanguageBChange: (code: string) => void;
  termsText: string;
  onTermsTextChange: (text: string) => void;
  speakers: Map<string, SpeakerInfo>;
  onRenameSpeaker: (speakerId: string, newLabel: string) => void;
  recordingState: "idle" | "connecting" | "recording";
  elapsedSeconds: number;
  onStart: () => void;
  onStop: () => void;
  audioAnalyser: AnalyserNode | null;
  onExport: () => void;
  onNewMeeting: () => void;
  hasEntries: boolean;
}

export default function Sidebar({
  translationMode,
  onTranslationModeChange,
  languageA,
  languageB,
  onLanguageAChange,
  onLanguageBChange,
  termsText,
  onTermsTextChange,
  speakers,
  onRenameSpeaker,
  recordingState,
  elapsedSeconds,
  onStart,
  onStop,
  audioAnalyser,
  onExport,
  onNewMeeting,
  hasEntries,
}: SidebarProps) {
  const isRecording = recordingState === "recording";
  const isIdle = recordingState === "idle";
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");

  return (
    <aside className="flex w-72 flex-col border-r border-gray-200 bg-white h-full overflow-hidden">
      {/* Header: Record button + timer */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 space-y-2">
        <AudioWaveButton
          recordingState={recordingState}
          onStart={onStart}
          onStop={onStop}
          audioAnalyser={audioAnalyser}
        />
        {isRecording && (
          <div className="flex items-center justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500 recording-pulse" />
            <span className="font-mono text-sm font-semibold text-gray-800">
              {minutes}:{seconds}
            </span>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto sidebar-scroll">
        <TranslationModeToggle
          mode={translationMode}
          onChange={onTranslationModeChange}
          disabled={isRecording}
        />

        {translationMode === "two_way" ? (
          <BetweenLanguages
            languageA={languageA}
            languageB={languageB}
            onLanguageAChange={onLanguageAChange}
            onLanguageBChange={onLanguageBChange}
            disabled={isRecording}
          />
        ) : (
          <FromToLanguages
            languageA={languageA}
            languageB={languageB}
            onLanguageAChange={onLanguageAChange}
            onLanguageBChange={onLanguageBChange}
            disabled={isRecording}
          />
        )}

        <TermsPanel
          termsText={termsText}
          onTermsTextChange={onTermsTextChange}
          isRecording={isRecording}
        />

        <SpeakerPanel
          speakers={speakers}
          onRenameSpeaker={onRenameSpeaker}
        />
      </div>

      {/* Bottom controls (sticky) */}
      {hasEntries && (
        <div className="shrink-0 border-t border-gray-200 bg-white p-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onExport}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 transition hover:bg-gray-50"
            >
              <svg
                className="h-3.5 w-3.5"
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
              Export
            </button>
            {isIdle && (
              <button
                type="button"
                onClick={onNewMeeting}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 transition hover:bg-gray-50"
              >
                New Meeting
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
