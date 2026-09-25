"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSonioxTranscription } from "@/hooks/useSonioxTranscription";
import { useSpeakerManager } from "@/hooks/useSpeakerManager";
import { triggerBilingualDownload } from "@/lib/exportBilingual";
import type { SttProvider, TranslationEngine, TranslationMode } from "@/types/bilingual";
import { TooltipProvider } from "@/components/ui/tooltip";
import { t } from "@/lib/i18n";
import Sidebar from "@/components/Sidebar";
import StatusBar from "@/components/StatusBar";
import TranscriptPanel from "@/components/TranscriptPanel";
import PresentationPanel from "@/components/PresentationPanel";
import MobileBottom from "@/components/mobile/MobileBottom";
import DesktopTopBar from "@/components/desktop/DesktopTopBar";
import DesktopFloatingBar from "@/components/desktop/DesktopFloatingBar";

export type DesktopLayout = "sidebar" | "topbar" | "floating";

const AUDIO_PROCESSING_KEY = "audioProcessing";

function readAudioProcessing(): boolean {
  try {
    return localStorage.getItem(AUDIO_PROCESSING_KEY) === "on";
  } catch {
    return false;
  }
}

// Re-read on changes from this tab (custom event) or other tabs ("storage")
function subscribeAudioProcessing(onChange: () => void) {
  window.addEventListener(AUDIO_PROCESSING_KEY, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(AUDIO_PROCESSING_KEY, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export default function Home() {
  const [languageA, setLanguageA] = useState<string[]>(["*"]);
  const [languageB, setLanguageB] = useState("en");
  const [termsText, setTermsText] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  const [customTerms, setCustomTerms] = useState<string[]>([]);
  const [translationMode, setTranslationMode] =
    useState<TranslationMode>("two_way");
  const [targetLangs, setTargetLangs] = useState<string[]>(["en"]);
  const [desktopLayout, setDesktopLayout] = useState<DesktopLayout>("sidebar");
  const [sttProvider, setSttProvider] = useState<SttProvider>("soniox");
  const [r2t2Enabled, setR2t2Enabled] = useState(false);
  const [translationEngine, setTranslationEngine] = useState<TranslationEngine>("llm");
  const [t3poEnabled, setT3poEnabled] = useState(false);
  // Browser noise suppression etc. Off by default: raw audio transcribes
  // better. Stored in localStorage; false during server render.
  const audioProcessing = useSyncExternalStore(
    subscribeAudioProcessing,
    readAudioProcessing,
    () => false
  );

  useEffect(() => {
    const saved = localStorage.getItem("desktopLayout");
    if (saved === "sidebar" || saved === "topbar" || saved === "floating") {
      setDesktopLayout(saved);
    }
  }, []);

  // R2T2 is only selectable when the server has a self-hosted endpoint configured
  useEffect(() => {
    fetch("/api/r2t2-config")
      .then((r) => r.json())
      .then((d) => {
        const enabled = !!d.enabled;
        setR2t2Enabled(enabled);
        if (enabled && localStorage.getItem("sttProvider") === "r2t2") {
          setSttProvider("r2t2");
        }
      })
      .catch(() => {});
  }, []);

  // Restore the translation mode; T3PO only when its server is configured
  useEffect(() => {
    fetch("/api/simul")
      .then((r) => r.json())
      .catch(() => ({ enabled: false }))
      .then((d) => {
        const enabled = !!d.enabled;
        setT3poEnabled(enabled);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem("translationEngine");
        } catch {
          // storage unavailable
        }
        if (saved === "clause" || (saved === "t3po" && enabled)) setTranslationEngine(saved);
      });
  }, []);

  const handleTranslationEngineChange = useCallback((engine: TranslationEngine) => {
    setTranslationEngine(engine);
    try {
      localStorage.setItem("translationEngine", engine);
    } catch {
      // storage unavailable: the choice just won't stick
    }
  }, []);

  const handleAudioProcessingChange = useCallback((on: boolean) => {
    try {
      localStorage.setItem(AUDIO_PROCESSING_KEY, on ? "on" : "off");
    } catch {
      // storage unavailable: the toggle just won't stick
    }
    window.dispatchEvent(new Event(AUDIO_PROCESSING_KEY));
  }, []);

  const handleSttProviderChange = useCallback((provider: SttProvider) => {
    setSttProvider(provider);
    localStorage.setItem("sttProvider", provider);
  }, []);

  const handleDesktopLayoutChange = useCallback((layout: DesktopLayout) => {
    setDesktopLayout(layout);
    localStorage.setItem("desktopLayout", layout);
  }, []);

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

  // Auto-register speakers from entries (distinct IDs only — entries change
  // on every token update)
  const speakerIds = useMemo(
    () => Array.from(new Set(entries.map((e) => e.speaker))).join(","),
    [entries]
  );
  useEffect(() => {
    if (!speakerIds) return;
    for (const id of speakerIds.split(",")) registerSpeaker(id);
  }, [speakerIds, registerSpeaker]);

  const handleStart = useCallback(() => {
    const terms = termsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    clearEntries();
    clearSpeakers();
    start({
      provider: sttProvider === "r2t2" && r2t2Enabled ? "r2t2" : "soniox",
      audioProcessing,
      translationEngine: translationEngine === "t3po" && !t3poEnabled ? "llm" : translationEngine,
      languageA,
      languageB,
      contextTerms: terms,
      translationMode,
      ...(translationMode === "presentation" ? { targetLangs } : {}),
    });
  }, [
    languageA,
    languageB,
    termsText,
    translationMode,
    targetLangs,
    sttProvider,
    r2t2Enabled,
    audioProcessing,
    translationEngine,
    t3poEnabled,
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
          t("confirm_language_change")
        );
        if (!confirmed) return;
        stop();
      }
      setLanguageA(codes);
    },
    [recordingState, stop]
  );

  const handleTargetLangsChange = useCallback(
    (codes: string[]) => {
      if (recordingState === "recording") {
        const confirmed = window.confirm(
          t("confirm_language_change")
        );
        if (!confirmed) return;
        stop();
      }
      setTargetLangs(codes);
    },
    [recordingState, stop]
  );

  const handleLanguageBChange = useCallback(
    (code: string) => {
      if (recordingState === "recording") {
        const confirmed = window.confirm(
          t("confirm_language_change")
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
          t("confirm_mode_change")
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
    targetLangs,
    onTargetLangsChange: handleTargetLangsChange,
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
      {/* Desktop sidebar (only in sidebar layout) */}
      {desktopLayout === "sidebar" && (
        <div className="hidden lg:block">
          <Sidebar {...sharedProps} />
        </div>
      )}

      {/* Main content */}
      <main className="flex flex-1 flex-col min-w-0">
        <StatusBar
          recordingState={recordingState}
          elapsedSeconds={elapsedSeconds}
          error={error}
          desktopLayout={desktopLayout}
          onDesktopLayoutChange={handleDesktopLayoutChange}
          sttProvider={sttProvider}
          onSttProviderChange={handleSttProviderChange}
          r2t2Enabled={r2t2Enabled}
          audioProcessing={audioProcessing}
          onAudioProcessingChange={handleAudioProcessingChange}
          translationEngine={translationEngine}
          onTranslationEngineChange={handleTranslationEngineChange}
          t3poEnabled={t3poEnabled}
        />

        {/* Desktop top bar (only in topbar layout) */}
        {desktopLayout === "topbar" && (
          <div className="hidden lg:block">
            <DesktopTopBar {...sharedProps} />
          </div>
        )}

        {translationMode === "presentation" ? (
          <PresentationPanel
            entries={entries}
            currentInterim={currentInterim}
            speakers={speakers}
            isRecording={recordingState === "recording"}
            targetLangs={targetLangs}
          />
        ) : (
          <TranscriptPanel
            entries={entries}
            currentInterim={currentInterim}
            speakers={speakers}
            isRecording={recordingState === "recording"}
            languageA={languageA}
            languageB={languageB}
            onReassignSpeaker={reassignSpeaker}
          />
        )}

        {/* Mobile bottom bar (hidden on desktop) */}
        <div className="lg:hidden">
          <MobileBottom {...sharedProps} />
        </div>
      </main>

      {/* Desktop floating bar (only in floating layout) */}
      {desktopLayout === "floating" && (
        <div className="hidden lg:block">
          <DesktopFloatingBar {...sharedProps} />
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}
