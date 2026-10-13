"use client";

import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// Pause / resume a running recording (= mute yourself): the session stays
// open, nothing is transcribed until resumed. Same button in the status
// bar, the phone recording bar and presentation mode.
export default function PauseButton({
  paused,
  onPause,
  onResume,
  className,
  showLabel = true,
}: {
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  className?: string;
  showLabel?: boolean;
}) {
  const t = useT();
  const label = t(paused ? "resume_recording" : "pause_recording");
  return (
    <button
      type="button"
      onClick={paused ? onResume : onPause}
      aria-pressed={paused}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium transition-colors",
        paused
          ? "border-amber-700 bg-amber-700 text-white hover:bg-amber-800"
          : "border-border bg-background text-foreground hover:bg-muted",
        className
      )}
    >
      {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
      {showLabel && <span>{label}</span>}
    </button>
  );
}
