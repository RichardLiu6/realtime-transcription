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
import MobileSidebarDrawer from "@/components/MobileSidebarDrawer";

export default function Home() {
  const [languageA, setLanguageA] = useState("zh");
  const [languageB, setLanguageB] = useState("en");
  const [termsText, setTermsText] = useState("");
  const [translationMode, setTranslationMode] =
    useState<TranslationMode>("two_way");
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  // Close mobile drawer when recording starts
  useEffect(() => {
    if (recordingState === "recording") {
      setSidebarOpen(false);
    }
  }, [recordingState]);

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

  const handleLanguageChange = useCallback(
    (which: "A" | "B", code: string) => {
      if (recordingState === "recording") {
        const confirmed = window.confirm(
          "Changing language will stop recording. Continue?"
        );
        if (!confirmed) return;
        stop();
      }
      if (which === "A") setLanguageA(code);
      else setLanguageB(code);
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

  const sidebarProps = {
    translationMode,
    onTranslationModeChange: handleTranslationModeChange,
    languageA,
    languageB,
    onLanguageAChange: (code: string) => handleLanguageChange("A", code),
    onLanguageBChange: (code: string) => handleLanguageChange("B", code),
    termsText,
    onTermsTextChange: setTermsText,
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
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar {...sidebarProps} />
      </div>

      {/* Mobile sidebar drawer */}
      <MobileSidebarDrawer
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      >
        <Sidebar {...sidebarProps} />
      </MobileSidebarDrawer>

      {/* Main content */}
      <main className="flex flex-1 flex-col min-w-0">
        <StatusBar
          recordingState={recordingState}
          elapsedSeconds={elapsedSeconds}
          error={error}
          onToggleSidebar={() => setSidebarOpen(true)}
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
      </main>
    </div>
    </TooltipProvider>
  );
}
