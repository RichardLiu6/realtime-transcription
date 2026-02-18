"use client";

/**
 * Desktop Layout V2: Single-row top toolbar
 * Record | Mode | Languages | Terms chips (fill remaining space) | Speakers | Export
 * Terms overflow into a Popover when space is tight.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  BookOpen,
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
import { INDUSTRY_PRESETS } from "@/lib/contextTerms";
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

  // Measure how many preset chips fit in the available space
  const chipsContainerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(Object.keys(INDUSTRY_PRESETS).length);

  const presetEntries = useMemo(() => Object.entries(INDUSTRY_PRESETS), []);

  const measureChips = useCallback(() => {
    const container = chipsContainerRef.current;
    if (!container) return;
    const children = Array.from(container.children) as HTMLElement[];
    if (children.length === 0) return;

    const containerRight = container.getBoundingClientRect().right;
    let count = 0;
    for (const child of children) {
      // Skip the overflow button (last child when overflow exists)
      if (child.dataset.overflow) break;
      const childRight = child.getBoundingClientRect().right;
      if (childRight > containerRight + 2) break;
      count++;
    }
    setVisibleCount(count || 1);
  }, []);

  useEffect(() => {
    measureChips();
    const ro = new ResizeObserver(measureChips);
    if (chipsContainerRef.current) ro.observe(chipsContainerRef.current);
    return () => ro.disconnect();
  }, [measureChips, props.selectedPresets]);

  const togglePreset = useCallback(
    (key: string) => {
      const next = new Set(props.selectedPresets);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      props.onSelectedPresetsChange(next);
    },
    [props.selectedPresets, props.onSelectedPresetsChange]
  );

  const totalTerms = useMemo(() => {
    const presetTerms = Array.from(props.selectedPresets).flatMap(
      (key) => INDUSTRY_PRESETS[key]?.terms ?? []
    );
    return new Set([...presetTerms, ...props.customTerms]).size;
  }, [props.selectedPresets, props.customTerms]);

  const overflowPresets = presetEntries.slice(visibleCount);

  return (
    <div className="shrink-0 border-b border-border bg-background px-4 py-2">
      <div className="flex items-center gap-2">
        {/* Record / Stop */}
        {isRecording ? (
          <div className="flex items-center gap-2 shrink-0">
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
            className="gap-1.5 shrink-0"
          >
            {isConnecting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Mic className="size-3.5" />
            )}
            {isConnecting ? t("connecting") : t("start_recording")}
          </Button>
        )}

        <div className="h-5 w-px bg-border shrink-0" />

        {/* Mode toggle */}
        <ToggleGroup
          type="single"
          value={props.translationMode}
          onValueChange={(v) => {
            if (v) props.onTranslationModeChange(v as TranslationMode);
          }}
          disabled={isRecording}
          variant="outline"
          size="sm"
          className="shrink-0"
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

        <div className="h-5 w-px bg-border shrink-0" />

        {/* Inline language selects */}
        <div className="flex items-center gap-1.5 shrink-0">
          {props.translationMode === "two_way" ? (
            <>
              <Select
                value={langA}
                onValueChange={(code) => props.onLanguageAChange([code])}
                disabled={isRecording}
              >
                <SelectTrigger className="h-8 w-[110px] text-xs">
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
                <SelectTrigger className="h-8 w-[110px] text-xs">
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
              <Select
                value={props.languageA[0] === "*" ? "*" : (props.languageA[0] ?? "*")}
                onValueChange={(code) => props.onLanguageAChange([code])}
                disabled={isRecording}
              >
                <SelectTrigger className="h-8 w-[110px] text-xs">
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
                <SelectTrigger className="h-8 w-[110px] text-xs">
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

        <div className="h-5 w-px bg-border shrink-0" />

        {/* Terms chips — fill remaining space, overflow into popover */}
        <div
          ref={chipsContainerRef}
          className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden"
        >
          {presetEntries.map(([key, preset], idx) => (
            <button
              key={key}
              type="button"
              onClick={() => togglePreset(key)}
              className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-tight transition-colors whitespace-nowrap ${
                props.selectedPresets.has(key)
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              } ${idx >= visibleCount ? "invisible" : ""}`}
            >
              <span>{preset.label.split(" ")[0]}</span>
              {props.selectedPresets.has(key) && (
                <span className="opacity-70 text-[10px]">{preset.terms.length}</span>
              )}
            </button>
          ))}

          {/* Overflow: show "+N more" button that opens full terms popover */}
          {overflowPresets.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-overflow="true"
                  className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] bg-muted/60 text-muted-foreground hover:bg-muted whitespace-nowrap"
                >
                  <BookOpen className="size-3" />
                  +{overflowPresets.length}
                  {totalTerms > 0 && (
                    <span className="rounded-full bg-primary/15 px-1 text-[9px] font-medium text-primary">
                      {totalTerms}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" className="w-80 p-0">
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
          )}
        </div>

        {/* Speakers popover */}
        {props.speakers.size > 0 && (
          <>
            <div className="h-5 w-px bg-border shrink-0" />
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0">
                      <Users className="size-3.5" />
                      {props.speakers.size}
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>{t("speakers")}</TooltipContent>
              </Tooltip>
              <PopoverContent side="bottom" align="end" className="w-72 p-0">
                <SpeakerPanel
                  speakers={props.speakers}
                  entries={props.entries}
                  onRenameSpeaker={props.onRenameSpeaker}
                />
              </PopoverContent>
            </Popover>
          </>
        )}

        {/* Export / New Meeting */}
        {props.hasEntries && isIdle && (
          <>
            <div className="h-5 w-px bg-border shrink-0" />
            <div className="flex items-center gap-1 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon-sm" onClick={props.onExport}>
                    <Download className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("export")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon-sm" onClick={props.onNewMeeting}>
                    <FilePlus className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("new_meeting")}</TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
