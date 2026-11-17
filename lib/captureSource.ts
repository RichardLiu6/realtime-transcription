// Labels for the audio sources (收音来源): the mic; the iOS app's phone audio
// + mic; a desktop browser's meeting tab (or computer sound) + mic
import type { TranslationKey } from "@/lib/i18n";
import type { CaptureSource } from "@/types/bilingual";

export const CAPTURE_LABEL: Record<CaptureSource, TranslationKey> = {
  mic: "capture_mic",
  system: "capture_system",
  tab: "capture_tab",
};

export const CAPTURE_DESC: Record<CaptureSource, TranslationKey> = {
  mic: "capture_mic_desc",
  system: "capture_system_desc",
  tab: "capture_tab_desc",
};
