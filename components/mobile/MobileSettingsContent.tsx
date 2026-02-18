"use client";

import TranslationModeToggle from "@/components/sidebar/TranslationModeToggle";
import BetweenLanguages from "@/components/sidebar/BetweenLanguages";
import FromToLanguages from "@/components/sidebar/FromToLanguages";
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
      <SpeakerPanel
        speakers={props.speakers}
        entries={props.entries}
        onRenameSpeaker={props.onRenameSpeaker}
      />
    </div>
  );
}
