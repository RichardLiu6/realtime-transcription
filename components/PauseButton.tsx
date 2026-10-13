"use client";

import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// Pause / resume a running recording (= mute yourself): the session stays
// open, nothing is transcribed until resumed. Sits next to the stop button
// in every layout, as solid as it: amber 暂停, green 继续 (white text
// ≥ 4.5:1 on both).
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
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium text-white shadow-xs transition-colors",
        paused ? "bg-emerald-700 hover:bg-emerald-800" : "bg-amber-700 hover:bg-amber-800",
        className
      )}
    >
      {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
