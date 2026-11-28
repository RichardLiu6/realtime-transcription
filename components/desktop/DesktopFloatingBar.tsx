"use client";

/**
 * Desktop Layout V3: Floating bottom-right toolbar
 * Compact icon bar with Popovers, transcript takes full width
 */

import { useMemo, useState } from "react";
import PauseButton from "@/components/PauseButton";
import {
  Mic,
  Square,
  Loader2,
  BookOpen,
  Settings,
  Download,
  FilePlus,
  Users,
  SlidersHorizontal,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import TranslationModeToggle from "@/components/sidebar/TranslationModeToggle";
import BetweenLanguages from "@/components/sidebar/BetweenLanguages";
import FromToLanguages from "@/components/sidebar/FromToLanguages";
import PresentationLanguages from "@/components/sidebar/PresentationLanguages";
import TermsPanel from "@/components/sidebar/TermsPanel";
import SpeakerPanel from "@/components/sidebar/SpeakerPanel";
import type { TranslationMode, SpeakerInfo, BilingualEntry } from "@/types/bilingual";
import { INDUSTRY_PRESETS } from "@/lib/contextTerms";
import type { FabStyle } from "@/lib/useFabStyle";
import { useT } from "@/lib/i18n";

interface DesktopFloatingBarProps {
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
  // Pause / resume next to stop (absent where pausing isn't possible)
  paused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  audioAnalyser: AnalyserNode | null;
  entries: BilingualEntry[];
  onExport: () => void;
  onNewMeeting: () => void;
  hasEntries: boolean;
  // Sidebar layout with the sidebar collapsed: a round button that opens into
  // the bar (and closes again), so the transcript isn't covered
  collapsible?: boolean;
  // How the round button shows: faded until hovered, or not at all
  buttonStyle?: FabStyle;
}

export default function DesktopFloatingBar(props: DesktopFloatingBarProps) {
  const t = useT();
  const isRecording = props.recordingState === "recording";
  const isConnecting = props.recordingState === "connecting";
  const isIdle = props.recordingState === "idle";

  const totalTerms = useMemo(() => {
    const presetTerms = Array.from(props.selectedPresets).flatMap(
      (key) => INDUSTRY_PRESETS[key]?.terms ?? []
    );
    return new Set([...presetTerms, ...props.customTerms]).size;
  }, [props.selectedPresets, props.customTerms]);

  const [open, setOpen] = useState(false);
  if (props.collapsible && !open && props.buttonStyle === "hidden") return null;
  if (props.collapsible && !open) {
    // Recording shows on the button: a red dot (grey while paused)
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-toolbar-open
              onClick={() => setOpen(true)}
              aria-label={t("toolbar_open")}
              className={`relative grid size-12 place-items-center rounded-full bg-background/95 text-foreground shadow-lg ring-1 ring-border/60 backdrop-blur-sm transition hover:scale-105 hover:bg-muted ${
                props.buttonStyle === "faded" ? "opacity-30 hover:opacity-100 focus-visible:opacity-100" : ""
              }`}
            >
              <SlidersHorizontal className="size-5" aria-hidden />
              {(isRecording || isConnecting) && (
                <span
                  aria-hidden
                  className={`absolute right-0.5 top-0.5 size-3 rounded-full ring-2 ring-background ${
                    props.paused ? "bg-gray-400" : "bg-red-600 animate-pulse"
                  }`}
                />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{t("toolbar_open")}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div
        data-floating-toolbar
        className="flex origin-bottom-right animate-in fade-in zoom-in-95 items-center gap-2 rounded-2xl bg-background/95 backdrop-blur-sm px-4 py-3 shadow-lg ring-1 ring-border/50"
      >
        {/* Record / Stop (the timer is in the status bar) */}
        {isRecording ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="icon"
                onClick={props.onStop}
                aria-label={t("stop_recording")}
                className="size-10"
              >
                <Square className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("stop_recording")}</TooltipContent>
          </Tooltip>
        ) : null}
        {isRecording && props.onPause && props.onResume && (
          <PauseButton paused={!!props.paused} onPause={props.onPause} onResume={props.onResume} iconOnly className="size-10 px-0" />
        )}
        {isRecording ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={props.onStart}
                disabled={isConnecting}
                size="icon"
                aria-label={isConnecting ? t("connecting") : t("start_recording")}
                className="size-10"
              >
                {isConnecting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mic className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isConnecting ? t("connecting") : t("start_recording")}
            </TooltipContent>
          </Tooltip>
        )}

        <div className="h-6 w-px bg-border" />

        {/* Settings: mode + languages */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("settings")} className="size-10">
                  <Settings className="size-5" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">{t("settings")}</TooltipContent>
          </Tooltip>
          <PopoverContent side="top" align="end" className="w-72 p-0">
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
            ) : props.translationMode === "one_way" || props.translationMode === "transcribe" ? (
              <FromToLanguages
                sourceOnly={props.translationMode === "transcribe"}
                languageA={props.languageA}
                languageB={props.languageB}
                onLanguageAChange={props.onLanguageAChange}
                onLanguageBChange={props.onLanguageBChange}
                disabled={isRecording}
              />
            ) : (
              <PresentationLanguages
                languageA={props.languageA}
                targetLangs={props.targetLangs}
                onLanguageAChange={props.onLanguageAChange}
                onTargetLangsChange={props.onTargetLangsChange}
                disabled={isRecording}
              />
            )}
          </PopoverContent>
        </Popover>

        {/* Terms */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={totalTerms > 0 ? `${t("terms")} (${totalTerms})` : t("terms")}
                  className="size-10 relative"
                >
                  <BookOpen className="size-5" />
                  {totalTerms > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-medium flex items-center justify-center px-1">
                      {totalTerms}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">{t("terms")}</TooltipContent>
          </Tooltip>
          <PopoverContent side="top" align="end" className="w-80 p-0">
            <TermsPanel
              meeting={{ translationMode: props.translationMode, languageA: props.languageA, languageB: props.languageB, targetLangs: props.targetLangs }}
              termsText={props.termsText}
              onTermsTextChange={props.onTermsTextChange}
              selectedPresets={props.selectedPresets}
              onSelectedPresetsChange={props.onSelectedPresetsChange}
              customTerms={props.customTerms}
              onCustomTermsChange={props.onCustomTermsChange}
              isRecording={isRecording}
              inline
            />
          </PopoverContent>
        </Popover>

        {/* Speakers */}
        {props.speakers.size > 0 && (
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t("speakers")} (${props.speakers.size})`}
                    className="size-10 relative"
                  >
                    <Users className="size-5" />
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-muted text-muted-foreground text-[9px] font-medium flex items-center justify-center px-1">
                      {props.speakers.size}
                    </span>
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">{t("speakers")}</TooltipContent>
            </Tooltip>
            <PopoverContent side="top" align="end" className="w-72 p-0">
              <SpeakerPanel
                speakers={props.speakers}
                entries={props.entries}
                onRenameSpeaker={props.onRenameSpeaker}
              />
            </PopoverContent>
          </Popover>
        )}

        {/* Export / New Meeting */}
        {props.hasEntries && isIdle && (
          <>
            <div className="h-6 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={props.onExport} aria-label={t("export")} className="size-10">
                  <Download className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("export")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={props.onNewMeeting}
                  aria-label={t("new_meeting")}
                  className="size-10"
                >
                  <FilePlus className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("new_meeting")}</TooltipContent>
            </Tooltip>
          </>
        )}
        {props.collapsible && (
          <>
            <div className="h-6 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-toolbar-close
                  onClick={() => setOpen(false)}
                  aria-label={t("toolbar_close")}
                  className="size-10"
                >
                  <ChevronsRight className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("toolbar_close")}</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}
