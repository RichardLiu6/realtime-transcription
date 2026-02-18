"use client";

import { Download, FilePlus } from "lucide-react";
import type { TranslationMode, SpeakerInfo, BilingualEntry } from "@/types/bilingual";
import { Button } from "@/components/ui/button";
import TranslationModeToggle from "@/components/sidebar/TranslationModeToggle";
import BetweenLanguages from "@/components/sidebar/BetweenLanguages";
import FromToLanguages from "@/components/sidebar/FromToLanguages";
import TermsPanel from "@/components/sidebar/TermsPanel";
import SpeakerPanel from "@/components/sidebar/SpeakerPanel";
import AudioWaveButton from "@/components/sidebar/AudioWaveButton";

interface SidebarProps {
  translationMode: TranslationMode;
  onTranslationModeChange: (mode: TranslationMode) => void;
  languageA: string[];
  languageB: string;
  onLanguageAChange: (codes: string[]) => void;
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
  entries: BilingualEntry[];
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
  entries,
  onExport,
  onNewMeeting,
  hasEntries,
}: SidebarProps) {
  const isRecording = recordingState === "recording";
  const isIdle = recordingState === "idle";
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");

  return (
    <aside className="flex w-72 flex-col border-r border-border bg-background h-full overflow-hidden">
      {/* Header: Record button + timer */}
      <div className="shrink-0 px-4 py-3 border-b border-border space-y-2">
        <AudioWaveButton
          recordingState={recordingState}
          onStart={onStart}
          onStop={onStop}
          audioAnalyser={audioAnalyser}
        />
        {isRecording && (
          <div className="flex items-center justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500 recording-pulse" />
            <span className="font-mono text-sm font-semibold text-foreground">
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
          entries={entries}
          onRenameSpeaker={onRenameSpeaker}
        />
      </div>

      {/* Bottom controls (sticky) */}
      {hasEntries && (
        <div className="shrink-0 border-t border-border bg-background p-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              className="flex-1"
            >
              <Download className="size-3.5" />
              Export
            </Button>
            {isIdle && (
              <Button
                variant="outline"
                size="sm"
                onClick={onNewMeeting}
                className="flex-1"
              >
                <FilePlus className="size-3.5" />
                New Meeting
              </Button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
