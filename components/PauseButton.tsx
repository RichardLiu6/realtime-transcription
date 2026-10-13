"use client";

import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// Pause / resume a running recording (= mute yourself): the session stays
// open, nothing is transcribed until resumed. Sits next to the stop button
// in every layout.
export default function PauseButton({
  paused,
  onPause,
  onResume,
  className,
  iconOnly = false,
}: {
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  className?: string;
  iconOnly?: boolean;
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
      data-pause-button
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium shadow-xs transition-colors",
        // The app's own button styles: outline while recording (stop stays
        // the one red button), primary 继续 while paused
        paused
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-border bg-background text-foreground hover:bg-muted",
        className
      )}
    >
      {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
