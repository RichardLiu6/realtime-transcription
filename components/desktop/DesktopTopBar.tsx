"use client";

/**
 * Desktop Layout V2: Top toolbar
 * Two-row bar: controls on top, languages + terms inline below
 */

import { useMemo } from "react";
import {
  Mic,
  Square,
  Loader2,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpDown,
  ArrowDown,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TermsPanel from "@/components/sidebar/TermsPanel";
import SpeakerPanel from "@/components/sidebar/SpeakerPanel";
import type { TranslationMode, SpeakerInfo, BilingualEntry } from "@/types/bilingual";
import { SONIOX_LANGUAGES } from "@/types/bilingual";
import { useT } from "@/lib/i18n";

interface DesktopTopBarProps {
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

export default function DesktopTopBar(props: DesktopTopBarProps) {
  const t = useT();
  const isRecording = props.recordingState === "recording";
  const isConnecting = props.recordingState === "connecting";
  const isIdle = props.recordingState === "idle";
  const minutes = String(Math.floor(props.elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(props.elapsedSeconds % 60).padStart(2, "0");

  // two_way mode uses single language
  const langA = props.languageA[0] === "*" ? "zh" : (props.languageA[0] ?? "zh");

  return (
    <div className="shrink-0 border-b border-border bg-background">
      {/* Row 1: Record + Mode + Languages + Speakers + Export */}
      <div className="flex items-center gap-3 px-4 py-2">
        {/* Record / Stop */}
        {isRecording ? (
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 recording-pulse" />
            <span className="font-mono text-sm font-semibold">
              {minutes}:{seconds}
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={props.onStop}
              className="gap-1.5"
            >
              <Square className="size-3.5" />
              {t("stop")}
            </Button>
          </div>
        ) : (
          <Button
            onClick={props.onStart}
            disabled={isConnecting}
            size="sm"
            className="gap-1.5"
          >
            {isConnecting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Mic className="size-3.5" />
            )}
            {isConnecting ? t("connecting") : t("start_recording")}
          </Button>
        )}

        <div className="h-5 w-px bg-border" />

        {/* Mode toggle (inline) */}
        <ToggleGroup
          type="single"
          value={props.translationMode}
          onValueChange={(v) => {
            if (v) props.onTranslationModeChange(v as TranslationMode);
          }}
          disabled={isRecording}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="two_way" className="gap-1 text-xs px-2">
            <ArrowLeftRight className="size-3" />
            {t("mode_between")}
          </ToggleGroupItem>
          <ToggleGroupItem value="one_way" className="gap-1 text-xs px-2">
            <ArrowRight className="size-3" />
            {t("mode_from_to")}
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="h-5 w-px bg-border" />

        {/* Inline language selects */}
        <div className="flex items-center gap-1.5">
          {props.translationMode === "two_way" ? (
            <>
              <Select
                value={langA}
                onValueChange={(code) => props.onLanguageAChange([code])}
                disabled={isRecording}
              >
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SONIOX_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code} disabled={lang.code === props.languageB}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0" />
              <Select
                value={props.languageB}
                onValueChange={props.onLanguageBChange}
                disabled={isRecording}
              >
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SONIOX_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code} disabled={lang.code === langA}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <>
              <span className="text-[10px] text-muted-foreground shrink-0">{t("source_language")}</span>
              <Select
                value={props.languageA[0] === "*" ? "*" : (props.languageA[0] ?? "*")}
                onValueChange={(code) => props.onLanguageAChange([code])}
                disabled={isRecording}
              >
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="*">{t("any_language")}</SelectItem>
                  {SONIOX_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ArrowDown className="size-3.5 text-muted-foreground shrink-0" />
              <Select
                value={props.languageB}
                onValueChange={props.onLanguageBChange}
                disabled={isRecording}
              >
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SONIOX_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        {/* Speakers popover */}
        {props.speakers.size > 0 && (
          <>
            <div className="h-5 w-px bg-border" />
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                      <Users className="size-3.5" />
                      {t("speakers")} ({props.speakers.size})
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>{t("speakers")}</TooltipContent>
              </Tooltip>
              <PopoverContent side="bottom" align="start" className="w-72 p-0">
                <SpeakerPanel
                  speakers={props.speakers}
                  entries={props.entries}
                  onRenameSpeaker={props.onRenameSpeaker}
                />
              </PopoverContent>
            </Popover>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Export / New Meeting */}
        {props.hasEntries && isIdle && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={props.onExport} className="gap-1.5 text-xs">
              <Download className="size-3.5" />
              {t("export")}
            </Button>
            <Button variant="outline" size="sm" onClick={props.onNewMeeting} className="gap-1.5 text-xs">
              <FilePlus className="size-3.5" />
              {t("new_meeting")}
            </Button>
          </div>
        )}
      </div>

      {/* Row 2: Terms inline */}
      <div className="border-t border-border/50 px-4 py-2">
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
      </div>
    </div>
  );
}
