"use client";

/**
 * Desktop Layout V2: Single-row top toolbar
 * Record | Mode | Languages | Terms chips (fill remaining space) | Terms | Speakers | Export
 * Preset chips that don't fit collapse into "+N"; the Terms button (always
 * there) opens the full terms panel, custom terms included.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  Square,
  Loader2,
  ArrowLeftRight,
  ArrowRight,
  Monitor,
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
import { Badge } from "@/components/ui/badge";
import TermsPanel from "@/components/sidebar/TermsPanel";
import SpeakerPanel from "@/components/sidebar/SpeakerPanel";
import PresentationLanguages from "@/components/sidebar/PresentationLanguages";
import type { TranslationMode, SpeakerInfo, BilingualEntry } from "@/types/bilingual";
import { SONIOX_LANGUAGES } from "@/types/bilingual";
import { INDUSTRY_PRESETS, presetLabel } from "@/lib/contextTerms";
import { useLanguageName, useT } from "@/lib/i18n";

interface DesktopTopBarProps {
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
  audioAnalyser: AnalyserNode | null;
  entries: BilingualEntry[];
  onExport: () => void;
  onNewMeeting: () => void;
  hasEntries: boolean;
}

const chipClass = (selected: boolean) =>
  `shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-tight transition-colors whitespace-nowrap ${
    selected
      ? "bg-primary text-primary-foreground font-medium"
      : "bg-muted/60 text-muted-foreground hover:bg-muted"
  }`;

export default function DesktopTopBar(props: DesktopTopBarProps) {
  const t = useT();
  const langName = useLanguageName();
  const isRecording = props.recordingState === "recording";
  const isConnecting = props.recordingState === "connecting";
  const isIdle = props.recordingState === "idle";

  // two_way mode uses single language
  const langA = props.languageA[0] === "*" ? "zh" : (props.languageA[0] ?? "zh");

  // How many preset chips fit in the space left. Widths come from an
  // invisible, absolutely positioned copy of every chip (plus a "+N"
  // sample), so chips that don't fit are simply not rendered — hidden ones
  // taking up room is what pushed "+N" out of view.
  const chipsContainerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(Object.keys(INDUSTRY_PRESETS).length);
  const [termsOpen, setTermsOpen] = useState(false);

  const presetEntries = useMemo(() => Object.entries(INDUSTRY_PRESETS), []);

  const measureChips = useCallback(() => {
    const container = chipsContainerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const widths = Array.from(measure.children, (c) => c.getBoundingClientRect().width);
    const overflowWidth = widths.pop() ?? 0;
    const GAP = 4; // gap-1
    const available = container.clientWidth;
    const all = widths.reduce((sum, w, i) => sum + w + (i ? GAP : 0), 0);
    if (all <= available) {
      setVisibleCount(widths.length);
      return;
    }
    let used = 0;
    let count = 0;
    for (const w of widths) {
      const next = used + (count ? GAP : 0) + w;
      if (next + GAP + overflowWidth > available) break;
      used = next;
      count++;
    }
    setVisibleCount(count);
  }, []);

  // Re-measure on resize, and when chip widths change (selection count,
  // interface language)
  useEffect(() => {
    measureChips();
    const ro = new ResizeObserver(measureChips);
    if (chipsContainerRef.current) ro.observe(chipsContainerRef.current);
    return () => ro.disconnect();
  }, [measureChips, props.selectedPresets, t]);

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
        {/* The timer is in the status bar */}
        {isRecording ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={props.onStop}
            aria-label={t("stop_recording")}
            className="gap-1.5 shrink-0"
          >
            <Square className="size-3.5" />
            {t("stop")}
          </Button>
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
          <ToggleGroupItem value="presentation" className="gap-1 text-xs px-2">
            <Monitor className="size-3" />
            {t("mode_presentation")}
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
                      {langName(lang.code)}
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
                      {langName(lang.code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : props.translationMode === "one_way" ? (
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
                      {langName(lang.code)}
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
                      {langName(lang.code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={isRecording}>
                  <ArrowDown className="size-3" />
                  {props.targetLangs.map((code) => (
                    <Badge key={code} variant="secondary" className="text-[10px] px-1 py-0 h-4">
                      {langName(code)}
                    </Badge>
                  ))}
                </Button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" className="w-72 p-0">
                <PresentationLanguages
                  languageA={props.languageA}
                  targetLangs={props.targetLangs}
                  onLanguageAChange={props.onLanguageAChange}
                  onTargetLangsChange={props.onTargetLangsChange}
                  disabled={isRecording}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>

        <div className="h-5 w-px bg-border shrink-0" />

        {/* Preset chips — as many as fit; the rest collapse into "+N" */}
        <div
          ref={chipsContainerRef}
          className="relative flex items-center gap-1 flex-1 min-w-0 overflow-hidden"
        >
          {/* Invisible copies for measuring (every chip + a "+N" sample) */}
          <div
            ref={measureRef}
            aria-hidden
            className="pointer-events-none invisible absolute left-0 top-0 flex gap-1"
          >
            {presetEntries.map(([key, preset]) => (
              <span key={key} className={chipClass(props.selectedPresets.has(key))}>
                <span>{presetLabel(key, preset.label, t)}</span>
                {props.selectedPresets.has(key) && (
                  <span className="opacity-70 text-[10px]">{preset.terms.length}</span>
                )}
              </span>
            ))}
            <span className={chipClass(false)}>+{presetEntries.length}</span>
          </div>

          {presetEntries.slice(0, visibleCount).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              aria-pressed={props.selectedPresets.has(key)}
              onClick={() => togglePreset(key)}
              className={chipClass(props.selectedPresets.has(key))}
            >
              <span>{presetLabel(key, preset.label, t)}</span>
              {props.selectedPresets.has(key) && (
                <span className="opacity-70 text-[10px]">{preset.terms.length}</span>
              )}
            </button>
          ))}

          {/* The hidden presets are in the full terms panel */}
          {overflowPresets.length > 0 && (
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              aria-label={`${t("context_terms")} +${overflowPresets.length}`}
              className={chipClass(false)}
            >
              +{overflowPresets.length}
            </button>
          )}
        </div>

        {/* Terms: always here — the only way to add custom terms in this
            layout */}
        <Popover open={termsOpen} onOpenChange={setTermsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs shrink-0">
              <BookOpen className="size-3.5" />
              {t("terms")}
              {totalTerms > 0 && <span className="tabular-nums">({totalTerms})</span>}
            </Button>
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

        {/* Speakers popover */}
        {props.speakers.size > 0 && (
          <>
            <div className="h-5 w-px bg-border shrink-0" />
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`${t("speakers")} (${props.speakers.size})`}
                      className="gap-1.5 text-xs shrink-0"
                    >
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
                  <Button variant="outline" size="icon-sm" onClick={props.onExport} aria-label={t("export")}>
                    <Download className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("export")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={props.onNewMeeting}
                    aria-label={t("new_meeting")}
                  >
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
