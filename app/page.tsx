"use client";

import { useCallback, useEffect, useState } from "react";
import { useSonioxTranscription } from "@/hooks/useSonioxTranscription";
import { useSpeakerManager } from "@/hooks/useSpeakerManager";
import { triggerBilingualDownload } from "@/lib/exportBilingual";
import TopBar from "@/components/TopBar";
import BilingualDisplay from "@/components/BilingualDisplay";
import SpeakerBar from "@/components/SpeakerBar";

export default function Home() {
  const [languageA, setLanguageA] = useState("zh");
  const [languageB, setLanguageB] = useState("en");
  const [termsText, setTermsText] = useState("");

  const {
    entries,
    recordingState,
    error,
    elapsedSeconds,
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
    start({ languageA, languageB, contextTerms: terms });
  }, [languageA, languageB, termsText, start, clearEntries, clearSpeakers]);

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
          "切换语言将停止当前录音，是否继续？"
        );
        if (!confirmed) return;
        stop();
      }
      if (which === "A") setLanguageA(code);
      else setLanguageB(code);
    },
    [recordingState, stop]
  );

  const handleRenameSpeaker = useCallback(
    (speakerId: string, newLabel: string) => {
      renameSpeaker(speakerId, newLabel);
    },
    [renameSpeaker]
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Error banner */}
      {error && (
        <div className="shrink-0 bg-red-50 px-4 py-2 text-center text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Top bar: always visible */}
      <TopBar
        recordingState={recordingState}
        elapsedSeconds={elapsedSeconds}
        termsText={termsText}
        onTermsTextChange={setTermsText}
        onStart={handleStart}
        onStop={handleStop}
        onExport={handleExport}
        onNewMeeting={handleNewMeeting}
        hasEntries={entries.length > 0}
      />

      {/* Main transcript display */}
      <div className="flex min-h-0 flex-1 flex-col">
        <BilingualDisplay
          entries={entries}
          speakers={speakers}
          isRecording={recordingState === "recording"}
          languageA={languageA}
          languageB={languageB}
          onLanguageAChange={(code) => handleLanguageChange("A", code)}
          onLanguageBChange={(code) => handleLanguageChange("B", code)}
          onReassignSpeaker={reassignSpeaker}
        />
      </div>

      {/* Speaker bar */}
      <SpeakerBar speakers={speakers} onRenameSpeaker={handleRenameSpeaker} />
    </div>
  );
}
