"use client";

import { useEffect } from "react";
import { Mic, MicOff, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { AUTO_STOP_MIN, type AutoStopState } from "@/hooks/useAutoStop";

// Two soft tones, so a reminder in a background tab is noticed
function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.18;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.15, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.26);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {
    // no audio: the notice still shows
  }
}

// After an auto stop: "stopped" (quiet info), then "speech" when someone
// talks again (chime, and a system notification if the tab is hidden and
// notifications were already allowed — never asked for here)
export default function AutoStopNotice({
  state,
  listening,
  onContinue,
  onDismiss,
}: {
  state: AutoStopState;
  listening: boolean;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const vars = { min: AUTO_STOP_MIN };

  useEffect(() => {
    if (state !== "speech") return;
    chime();
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(t("speech_detected_title"), { body: t("speech_detected_body", vars) });
      } catch {
        // some browsers only allow notifications from a service worker
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state === "off") return null;
  const speech = state === "speech";

  return (
    <div
      role={speech ? "alert" : "status"}
      data-auto-stop-notice
      className="fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+3.5rem)] z-40 flex w-[min(92vw,28rem)] -translate-x-1/2 items-start gap-3 rounded-lg border border-border bg-background p-3 shadow-lg"
    >
      <span
        className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${
          speech ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"
        }`}
        aria-hidden
      >
        {speech ? <Mic className="size-4" /> : <MicOff className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {t(speech ? "speech_detected_title" : "auto_stopped_title")}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {speech
            ? t("speech_detected_body", vars)
            : t(listening ? "auto_stopped_listening" : "auto_stopped_body", vars)}
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Mic className="size-3.5" />
          {t("ph_continue")}
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("dismiss")}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
