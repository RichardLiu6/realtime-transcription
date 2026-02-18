"use client";

/**
 * V3: Full bottom area with mode toggle
 * - Not recording: bottom area shows compact settings + big record button
 * - Recording: collapses to thin status bar
 */

import { Square, Download, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import AudioWaveButton from "@/components/sidebar/AudioWaveButton";
import TranslationModeToggle from "@/components/sidebar/TranslationModeToggle";
import BetweenLanguages from "@/components/sidebar/BetweenLanguages";
import FromToLanguages from "@/components/sidebar/FromToLanguages";
import TermsPanel from "@/components/sidebar/TermsPanel";
import type { MobileBottomProps } from "./types";

export default function MobileBottomV3(props: MobileBottomProps) {
  const isRecording = props.recordingState === "recording";
  const isIdle = props.recordingState === "idle";
  const minutes = String(Math.floor(props.elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(props.elapsedSeconds % 60).padStart(2, "0");

  return (
    <div className="shrink-0 border-t border-border bg-background safe-area-bottom">
      {isRecording ? (
        /* Recording: compact status bar */
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex items-center gap-2 flex-1">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 recording-pulse" />
            <span className="font-mono text-base font-semibold">
              {minutes}:{seconds}
            </span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={props.onStop}
            className="gap-1.5"
          >
            <Square className="size-3.5" />
            Stop
          </Button>
        </div>
      ) : (
        /* Idle: full settings area */
        <div className="max-h-[50vh] overflow-y-auto">
          <TranslationModeToggle
            mode={props.translationMode}
            onChange={props.onTranslationModeChange}
            disabled={false}
          />
          {props.translationMode === "two_way" ? (
            <BetweenLanguages
              languageA={props.languageA}
              languageB={props.languageB}
              onLanguageAChange={props.onLanguageAChange}
              onLanguageBChange={props.onLanguageBChange}
              disabled={false}
            />
          ) : (
            <FromToLanguages
              languageA={props.languageA}
              languageB={props.languageB}
              onLanguageAChange={props.onLanguageAChange}
              onLanguageBChange={props.onLanguageBChange}
              disabled={false}
            />
          )}
          <TermsPanel
            termsText={props.termsText}
            onTermsTextChange={props.onTermsTextChange}
            selectedPresets={props.selectedPresets}
            onSelectedPresetsChange={props.onSelectedPresetsChange}
            customTerms={props.customTerms}
            onCustomTermsChange={props.onCustomTermsChange}
            isRecording={false}
          />
          {/* Record button + actions */}
          <div className="px-4 py-3 space-y-2">
            <AudioWaveButton
              recordingState={props.recordingState}
              onStart={props.onStart}
              onStop={props.onStop}
              audioAnalyser={props.audioAnalyser}
            />
            {props.hasEntries && isIdle && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={props.onExport} className="flex-1">
                  <Download className="size-3.5" />
                  Export
                </Button>
                <Button variant="outline" size="sm" onClick={props.onNewMeeting} className="flex-1">
                  <FilePlus className="size-3.5" />
                  New Meeting
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
