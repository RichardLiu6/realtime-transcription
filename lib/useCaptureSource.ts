"use client";

import { useSyncExternalStore } from "react";
import type { CaptureSource } from "@/types/bilingual";
import { broadcastAvailable } from "@/lib/native/stt";
import { canCaptureTabAudio } from "@/lib/tabAudio";
import { useStoredState } from "@/lib/useStoredState";

const noSubscribe = () => () => {};
const isCaptureSource = (v: unknown): v is CaptureSource => v === "mic" || v === "system" || v === "tab";

// 收音来源 (localStorage `captureSource`, shared by every caller): the iOS
// app offers mic / phone audio, a desktop browser mic / meeting tab, others
// only the mic (options null). A stored source this device can't use reads as
// "mic".
export function useCaptureSource(): {
  options: CaptureSource[] | null;
  source: CaptureSource;
  setSource: (source: CaptureSource) => void;
} {
  const system = useSyncExternalStore(noSubscribe, broadcastAvailable, () => false);
  const tab = useSyncExternalStore(noSubscribe, canCaptureTabAudio, () => false);
  const options: CaptureSource[] | null = system ? ["mic", "system"] : tab ? ["mic", "tab"] : null;
  const [stored, setSource] = useStoredState<CaptureSource>("captureSource", "mic", isCaptureSource);
  return { options, source: options?.includes(stored) ? stored : "mic", setSource };
}
