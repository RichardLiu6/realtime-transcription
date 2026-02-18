"use client";

/**
 * V1: Fixed bottom bar + slide-up settings panel
 * - Always-visible thin bar: record/stop button + timer
 * - Settings icon opens bottom Sheet
 */

import { useState } from "react";
import { Mic, Square, Loader2, Settings, Download, FilePlus } from "lucide-react";
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

export default function MobileBottomV1(props: MobileBottomProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isRecording = props.recordingState === "recording";
  const isConnecting = props.recordingState === "connecting";
  const isIdle = props.recordingState === "idle";
  const minutes = String(Math.floor(props.elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(props.elapsedSeconds % 60).padStart(2, "0");

  return (
    <>
      {/* Fixed bottom bar */}
      <div className="shrink-0 border-t border-border bg-background px-3 py-2 safe-area-bottom">
        {isRecording ? (
          /* Recording state: timer + waveform + stop */
          <div className="flex items-center gap-3">
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
          /* Idle/connecting state: record button + settings */
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
              {isConnecting ? "Connecting..." : "Start Recording"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              className="h-11 w-11 shrink-0"
            >
              <Settings className="size-5" />
            </Button>
            {props.hasEntries && isIdle && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={props.onExport}
                  className="h-11 w-11 shrink-0"
                >
                  <Download className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={props.onNewMeeting}
                  className="h-11 w-11 shrink-0"
                >
                  <FilePlus className="size-4" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Settings sheet (from bottom) */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="rounded-t-xl max-h-[75vh] p-0">
          <VisuallyHidden.Root>
            <SheetTitle>Settings</SheetTitle>
          </VisuallyHidden.Root>
          {/* Drag handle */}
          <div className="flex justify-center py-2">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>
          <MobileSettingsContent {...props} />
        </SheetContent>
      </Sheet>
    </>
  );
}
