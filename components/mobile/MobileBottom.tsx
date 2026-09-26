"use client";

/**
 * Mobile: Fixed bottom bar + slide-up settings panel
 * - Always-visible thin bar: record/stop button + timer
 * - Settings icon opens bottom Sheet
 * - Terms icon opens Popover for quick preset toggling
 */

import { useState, useMemo, useEffect } from "react";
import { Mic, Square, Loader2, Settings, Download, FilePlus, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
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
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import AudioWaveButton from "@/components/sidebar/AudioWaveButton";
import TermsPanel from "@/components/sidebar/TermsPanel";
import MobileSettingsContent from "./MobileSettingsContent";
import type { MobileBottomProps } from "./types";
import { INDUSTRY_PRESETS } from "@/lib/contextTerms";
import { useT } from "@/lib/i18n";

// Set once the settings sheet has opened by itself, so it does so only once
const SETTINGS_SEEN_KEY = "mobileSettingsSeen";

export default function MobileBottom(props: MobileBottomProps) {
  const t = useT();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Open the settings by themselves only on first use (nothing chosen yet),
  // not on every page load
  useEffect(() => {
    if (window.innerWidth >= 1024) return;
    try {
      if (localStorage.getItem("translationMode") !== null) return;
      if (localStorage.getItem(SETTINGS_SEEN_KEY) !== null) return;
      localStorage.setItem(SETTINGS_SEEN_KEY, "1");
    } catch {
      return; // storage unavailable: can't tell a first visit, stay closed
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setSettingsOpen(true);
  }, []);
  const [termsOpen, setTermsOpen] = useState(false);
  const isRecording = props.recordingState === "recording";
  const isConnecting = props.recordingState === "connecting";
  const isIdle = props.recordingState === "idle";

  const totalTerms = useMemo(() => {
    const presetTerms = Array.from(props.selectedPresets).flatMap(
      (key) => INDUSTRY_PRESETS[key]?.terms ?? []
    );
    return new Set([...presetTerms, ...props.customTerms]).size;
  }, [props.selectedPresets, props.customTerms]);

  return (
    <>
      {/* Floating bottom bar */}
      <div className="mx-3 rounded-2xl bg-background/95 backdrop-blur-sm px-4 py-3 shadow-lg ring-1 ring-border/50 safe-area-bottom">
        {isRecording ? (
          /* Recording state: stop (the timer is in the status bar) */
          <Button
            variant="destructive"
            onClick={props.onStop}
            className="h-11 w-full gap-2"
          >
            <Square className="size-4" />
            {t("stop_recording")}
          </Button>
        ) : (
          /* Idle/connecting state: record button + terms + settings */
          <div className="flex items-center gap-2">
            <Button
              onClick={props.onStart}
              disabled={isConnecting}
              className="flex-1 h-11 gap-2"
            >
              {isConnecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mic className="size-4" />
              )}
              {isConnecting ? t("connecting") : t("start_recording")}
            </Button>

            {/* Terms popover */}
            <Popover open={termsOpen} onOpenChange={setTermsOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={totalTerms > 0 ? `${t("terms")} (${totalTerms})` : t("terms")}
                      className="h-11 w-11 shrink-0 relative"
                    >
                      <BookOpen className="size-5" />
                      {totalTerms > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center px-1">
                          {totalTerms}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">{t("terms")}</TooltipContent>
              </Tooltip>
              <PopoverContent
                side="top"
                align="end"
                className="w-[calc(100vw-2rem)] max-w-sm p-0"
              >
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

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
                  aria-label={t("settings")}
                  className="h-11 w-11 shrink-0"
                >
                  <Settings className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("settings")}</TooltipContent>
            </Tooltip>

            {props.hasEntries && isIdle && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={props.onExport}
                      aria-label={t("export")}
                      className="h-11 w-11 shrink-0"
                    >
                      <Download className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t("export")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={props.onNewMeeting}
                      aria-label={t("new_meeting")}
                      className="h-11 w-11 shrink-0"
                    >
                      <FilePlus className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t("new_meeting")}</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        )}
      </div>

      {/* Settings sheet (from bottom) */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="flex max-h-[75vh] flex-col gap-0 rounded-t-xl p-0"
        >
          <VisuallyHidden.Root>
            <SheetTitle>{t("settings")}</SheetTitle>
          </VisuallyHidden.Root>
          {/* Drag handle */}
          <div className="flex justify-center py-2">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MobileSettingsContent {...props} />
          </div>
          {/* A clear way out (besides swiping down / tapping outside) */}
          <div className="shrink-0 border-t border-border p-3 safe-area-bottom">
            <Button className="h-11 w-full" onClick={() => setSettingsOpen(false)}>
              {t("done")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
