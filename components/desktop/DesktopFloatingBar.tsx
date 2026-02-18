"use client";

/**
 * Desktop Layout V3: Floating bottom-right toolbar
 * Compact icon bar with Popovers, transcript takes full width
 */

import { useMemo } from "react";
import {
  Mic,
  Square,
  Loader2,
  BookOpen,
  Settings,
  Download,
  FilePlus,
  Users,
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
import TermsPanel from "@/components/sidebar/TermsPanel";
import SpeakerPanel from "@/components/sidebar/SpeakerPanel";
import type { TranslationMode, SpeakerInfo, BilingualEntry } from "@/types/bilingual";
import { INDUSTRY_PRESETS } from "@/lib/contextTerms";
import { useT } from "@/lib/i18n";

interface DesktopFloatingBarProps {
  translationMode: TranslationMode;
  onTranslationModeChange: (mode: TranslationMode) => void;
  languageA: string[];
  languageB: string;
  onLanguageAChange: (codes: string[]) => void;
  onLanguageBChange: (code: string) => void;
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

export default function DesktopFloatingBar(props: DesktopFloatingBarProps) {
  const t = useT();
  const isRecording = props.recordingState === "recording";
  const isConnecting = props.recordingState === "connecting";
  const isIdle = props.recordingState === "idle";
  const minutes = String(Math.floor(props.elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(props.elapsedSeconds % 60).padStart(2, "0");

  const totalTerms = useMemo(() => {
    const presetTerms = Array.from(props.selectedPresets).flatMap(
      (key) => INDUSTRY_PRESETS[key]?.terms ?? []
    );
    return new Set([...presetTerms, ...props.customTerms]).size;
  }, [props.selectedPresets, props.customTerms]);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="flex items-center gap-2 rounded-2xl bg-background/95 backdrop-blur-sm px-4 py-3 shadow-lg ring-1 ring-border/50">
        {/* Record / Stop */}
        {isRecording ? (
          <>
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 recording-pulse" />
            <span className="font-mono text-sm font-semibold">
              {minutes}:{seconds}
            </span>
            <Button
              variant="destructive"
              size="icon"
              onClick={props.onStop}
              className="size-10"
            >
              <Square className="size-4" />
            </Button>
          </>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={props.onStart}
                disabled={isConnecting}
                size="icon"
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
                <Button variant="ghost" size="icon" className="size-10">
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
            ) : (
              <FromToLanguages
                languageA={props.languageA}
                languageB={props.languageB}
                onLanguageAChange={props.onLanguageAChange}
                onLanguageBChange={props.onLanguageBChange}
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
                <Button variant="ghost" size="icon" className="size-10 relative">
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
                  <Button variant="ghost" size="icon" className="size-10 relative">
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
                <Button variant="ghost" size="icon" onClick={props.onExport} className="size-10">
                  <Download className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("export")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={props.onNewMeeting} className="size-10">
                  <FilePlus className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("new_meeting")}</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}
