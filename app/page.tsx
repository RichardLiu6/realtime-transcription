"use client";

import { useCallback, useEffect, useState } from "react";
import { useSonioxTranscription } from "@/hooks/useSonioxTranscription";
import { useSpeakerManager } from "@/hooks/useSpeakerManager";
import { triggerBilingualDownload } from "@/lib/exportBilingual";
import type { TranslationMode } from "@/types/bilingual";
import { TooltipProvider } from "@/components/ui/tooltip";
import Sidebar from "@/components/Sidebar";
import StatusBar from "@/components/StatusBar";
import TranscriptPanel from "@/components/TranscriptPanel";
import MobileBottom from "@/components/mobile/MobileBottom";

export default function Home() {
  const [languageA, setLanguageA] = useState<string[]>(["*"]);
  const [languageB, setLanguageB] = useState("en");
  const [termsText, setTermsText] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  const [customTerms, setCustomTerms] = useState<string[]>([]);
  const [translationMode, setTranslationMode] =
    useState<TranslationMode>("two_way");
  const {
    entries,
    currentInterim,
    recordingState,
    error,
    elapsedSeconds,
    audioAnalyser,
    start,
    stop,
    clearEntries,
    reassignSpeaker,
  } = useSonioxTranscription();

  const { speakers, registerSpeaker, renameSpeaker, clearSpeakers } =
    useSpeakerManager();

  // Auto-register speakers from entries
  useEffect(() => {
    for (const entry of entries) {
      registerSpeaker(entry.speaker);
    }
  }, [entries, registerSpeaker]);

  const handleStart = useCallback(() => {
    const terms = termsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    clearEntries();
    clearSpeakers();
    start({ languageA, languageB, contextTerms: terms, translationMode });
  }, [
    languageA,
    languageB,
    termsText,
    translationMode,
    start,
    clearEntries,
    clearSpeakers,
  ]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleExport = useCallback(() => {
    triggerBilingualDownload(entries);
  }, [entries]);

  const handleNewMeeting = useCallback(() => {
    clearEntries();
    clearSpeakers();
  }, [clearEntries, clearSpeakers]);

  const handleLanguageAChange = useCallback(
    (codes: string[]) => {
      if (recordingState === "recording") {
        const confirmed = window.confirm(
          "Changing language will stop recording. Continue?"
        );
        if (!confirmed) return;
        stop();
      }
      setLanguageA(codes);
    },
    [recordingState, stop]
  );

  const handleLanguageBChange = useCallback(
    (code: string) => {
      if (recordingState === "recording") {
        const confirmed = window.confirm(
          "Changing language will stop recording. Continue?"
        );
        if (!confirmed) return;
        stop();
      }
      setLanguageB(code);
    },
    [recordingState, stop]
  );

  const handleTranslationModeChange = useCallback(
    (mode: TranslationMode) => {
      if (recordingState === "recording") {
        const confirmed = window.confirm(
          "Changing translation mode will stop recording. Continue?"
        );
        if (!confirmed) return;
        stop();
      }
      setTranslationMode(mode);
    },
    [recordingState, stop]
  );

  const handleRenameSpeaker = useCallback(
    (speakerId: string, newLabel: string) => {
      renameSpeaker(speakerId, newLabel);
    },
    [renameSpeaker]
  );

  const sharedProps = {
    translationMode,
    onTranslationModeChange: handleTranslationModeChange,
    languageA,
    languageB,
    onLanguageAChange: handleLanguageAChange,
    onLanguageBChange: handleLanguageBChange,
    termsText,
    onTermsTextChange: setTermsText,
    selectedPresets,
    onSelectedPresetsChange: setSelectedPresets,
    customTerms,
    onCustomTermsChange: setCustomTerms,
    speakers,
    onRenameSpeaker: handleRenameSpeaker,
    recordingState,
    elapsedSeconds,
    onStart: handleStart,
    onStop: handleStop,
    audioAnalyser,
    entries,
    onExport: handleExport,
    onNewMeeting: handleNewMeeting,
    hasEntries: entries.length > 0,
  };

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar {...sharedProps} />
      </div>

      {/* Main content */}
      <main className="flex flex-1 flex-col min-w-0">
        <StatusBar
          recordingState={recordingState}
          elapsedSeconds={elapsedSeconds}
          error={error}
        />

        <TranscriptPanel
          entries={entries}
          currentInterim={currentInterim}
          speakers={speakers}
          isRecording={recordingState === "recording"}
          languageA={languageA}
          languageB={languageB}
          onReassignSpeaker={reassignSpeaker}
        />

        {/* Mobile bottom bar (hidden on desktop) */}
        <div className="lg:hidden">
          <MobileBottom {...sharedProps} />
        </div>
      </main>
    </div>
    </TooltipProvider>
  );
}
