"use client";

/**
 * V2: Bottom sheet that auto-collapses on recording
 * - Default: bottom Sheet auto-open with settings + record button
 * - Recording: Sheet closes, thin fixed bar shows status
 */

import { useEffect, useState } from "react";
import { Square, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import AudioWaveButton from "@/components/sidebar/AudioWaveButton";
import MobileSettingsContent from "./MobileSettingsContent";
import type { MobileBottomProps } from "./types";

export default function MobileBottomV2(props: MobileBottomProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const isRecording = props.recordingState === "recording";
  const isIdle = props.recordingState === "idle";
  const minutes = String(Math.floor(props.elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(props.elapsedSeconds % 60).padStart(2, "0");

  // Auto-close sheet when recording starts
  useEffect(() => {
    if (isRecording) setSheetOpen(false);
  }, [isRecording]);

  return (
    <>
      {/* Floating bottom bar */}
      <div className="mx-3 mb-3 rounded-2xl bg-background/95 backdrop-blur-sm shadow-lg ring-1 ring-border/50 safe-area-bottom">
        {isRecording ? (
          /* Recording: status bar */
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="flex items-center gap-2 flex-1">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 recording-pulse" />
              <span className="font-mono text-base font-semibold">
                {minutes}:{seconds}
              </span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={props.onStop}
              className="gap-1.5"
            >
              <Square className="size-3.5" />
              Stop
            </Button>
          </div>
        ) : (
          /* Idle: record button + expand */
          <div className="px-3 py-2 space-y-2">
            <AudioWaveButton
              recordingState={props.recordingState}
              onStart={props.onStart}
              onStop={props.onStop}
              audioAnalyser={props.audioAnalyser}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSheetOpen(true)}
              className="w-full text-muted-foreground gap-1"
            >
              <ChevronUp className="size-4" />
              Settings
            </Button>
          </div>
        )}
      </div>

      {/* Bottom sheet with settings */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="rounded-t-xl max-h-[70vh] p-0">
          <VisuallyHidden.Root>
            <SheetTitle>Settings</SheetTitle>
          </VisuallyHidden.Root>
          <div className="flex justify-center py-2">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>
          <MobileSettingsContent {...props} />
          {/* Bottom actions */}
          {props.hasEntries && isIdle && (
            <div className="border-t border-border p-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={props.onExport} className="flex-1">
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={props.onNewMeeting} className="flex-1">
                New Meeting
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
