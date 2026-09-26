"use client";

import { Download, FilePlus } from "lucide-react";
import type { TranslationMode, SpeakerInfo, BilingualEntry } from "@/types/bilingual";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import TranslationModeToggle from "@/components/sidebar/TranslationModeToggle";
import BetweenLanguages from "@/components/sidebar/BetweenLanguages";
import FromToLanguages from "@/components/sidebar/FromToLanguages";
import PresentationLanguages from "@/components/sidebar/PresentationLanguages";
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
  targetLangs: string[];
  onTargetLangsChange: (codes: string[]) => void;
  termsText: string;
  onTermsTextChange: (text: string) => void;
  selectedPresets: Set<string>;
  onSelectedPresetsChange: (presets: Set<string>) => void;
  customTerms: string[];
  onCustomTermsChange: (terms: string[]) => void;
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
  targetLangs,
  onTargetLangsChange,
  termsText,
  onTermsTextChange,
  selectedPresets,
  onSelectedPresetsChange,
  customTerms,
  onCustomTermsChange,
  speakers,
  onRenameSpeaker,
  recordingState,
  onStart,
  onStop,
  audioAnalyser,
  entries,
  onExport,
  onNewMeeting,
  hasEntries,
}: SidebarProps) {
  const t = useT();
  const isRecording = recordingState === "recording";
  const isIdle = recordingState === "idle";

  return (
    <aside className="flex w-72 flex-col border-r border-border bg-background h-full overflow-hidden">
      {/* Header: Record button (the timer is in the status bar) */}
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <AudioWaveButton
          recordingState={recordingState}
          onStart={onStart}
          onStop={onStop}
          audioAnalyser={audioAnalyser}
        />
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
        ) : translationMode === "one_way" ? (
          <FromToLanguages
            languageA={languageA}
            languageB={languageB}
            onLanguageAChange={onLanguageAChange}
            onLanguageBChange={onLanguageBChange}
            disabled={isRecording}
          />
        ) : (
          <PresentationLanguages
            languageA={languageA}
            targetLangs={targetLangs}
            onLanguageAChange={onLanguageAChange}
            onTargetLangsChange={onTargetLangsChange}
            disabled={isRecording}
          />
        )}

        <TermsPanel
          termsText={termsText}
          onTermsTextChange={onTermsTextChange}
          selectedPresets={selectedPresets}
          onSelectedPresetsChange={onSelectedPresetsChange}
          customTerms={customTerms}
          onCustomTermsChange={onCustomTermsChange}
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
              {t("export")}
            </Button>
            {isIdle && (
              <Button
                variant="outline"
                size="sm"
                onClick={onNewMeeting}
                className="flex-1"
              >
                <FilePlus className="size-3.5" />
                {t("new_meeting")}
              </Button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
