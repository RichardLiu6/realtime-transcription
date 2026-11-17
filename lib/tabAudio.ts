// The sound of an online meeting held in another browser tab (Google Meet,
// Teams / Zoom on the web…), or the whole computer's sound where the browser
// offers it (Chrome / Edge on Windows: "entire screen" + "share system
// audio"), through the screen-share picker. The hook mixes it with the
// microphone. Browser only; Safari and Firefox share no audio.

import { t } from "@/lib/i18n";

export function canCaptureTabAudio(): boolean {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) return false;
  // Phones and tablets have no tab sharing (and the app captures natively)
  return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Opens the picker; must run right after a click (the page's start button).
// Resolves with a stream that has an audio track, else throws a message the
// user can act on.
export async function captureMeetingAudio(): Promise<MediaStream> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      // Video is required by the API; one frame a second, never used
      video: { displaySurface: "browser", frameRate: 1 },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        // Keep hearing the meeting while it is captured
        suppressLocalAudioPlayback: false,
      },
      // Chrome: offer tabs first, not this page, and let the user switch tabs
      preferCurrentTab: false,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      systemAudio: "include",
    } as DisplayMediaStreamOptions);
  } catch (error) {
    if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError")) {
      throw new Error(t("err_tab_audio_cancelled"));
    }
    throw error;
  }
  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error(t("err_tab_audio_none"));
  }
  return stream;
}
