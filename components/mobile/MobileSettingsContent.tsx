"use client";

import TranslationModeToggle from "@/components/sidebar/TranslationModeToggle";
import BetweenLanguages from "@/components/sidebar/BetweenLanguages";
import FromToLanguages from "@/components/sidebar/FromToLanguages";
import TermsPanel from "@/components/sidebar/TermsPanel";
import SpeakerPanel from "@/components/sidebar/SpeakerPanel";
import type { MobileBottomProps } from "./types";

type Props = Pick<
  MobileBottomProps,
  | "translationMode"
  | "onTranslationModeChange"
  | "languageA"
  | "languageB"
  | "onLanguageAChange"
  | "onLanguageBChange"
  | "termsText"
  | "onTermsTextChange"
  | "selectedPresets"
  | "onSelectedPresetsChange"
  | "customTerms"
  | "onCustomTermsChange"
  | "speakers"
  | "onRenameSpeaker"
  | "entries"
  | "recordingState"
>;

export default function MobileSettingsContent(props: Props) {
  const isRecording = props.recordingState === "recording";

  return (
    <div className="overflow-y-auto pb-8">
      <TranslationModeToggle
        mode={props.translationMode}
        onChange={props.onTranslationModeChange}
        disabled={isRecording}
      />
      {props.translationMode === "two_way" ? (
        <BetweenLanguages
          languageA={props.languageA}
          languageB={props.languageB}
          onLanguageAChange={props.onLanguageAChange}
          onLanguageBChange={props.onLanguageBChange}
          disabled={isRecording}
        />
      ) : (
        <FromToLanguages
          languageA={props.languageA}
          languageB={props.languageB}
          onLanguageAChange={props.onLanguageAChange}
          onLanguageBChange={props.onLanguageBChange}
          disabled={isRecording}
        />
      )}
      <TermsPanel
        termsText={props.termsText}
        onTermsTextChange={props.onTermsTextChange}
        selectedPresets={props.selectedPresets}
        onSelectedPresetsChange={props.onSelectedPresetsChange}
        customTerms={props.customTerms}
        onCustomTermsChange={props.onCustomTermsChange}
        isRecording={isRecording}
      />
      <SpeakerPanel
        speakers={props.speakers}
        entries={props.entries}
        onRenameSpeaker={props.onRenameSpeaker}
      />
    </div>
  );
}
