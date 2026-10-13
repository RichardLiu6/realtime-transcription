"use client";

// Auto stop: Soniox bills the connection, not the speech, so a recording
// nobody talks into for AUTO_STOP_MIN minutes is stopped (a real stop: the
// session closes). The signal is the transcript itself — new text or a
// changed live tail — not the microphone level, so a humming room doesn't
// keep it running. Manual pause doesn't count down (the user chose it).
//
// After an auto stop the browser keeps listening locally (level only,
// nothing is sent or billed) for up to LISTEN_MAX_MS; when someone speaks
// the page reminds the user that the recording has stopped. The app's
// native audio can't be listened to from the page: there, only the stop.

import { useCallback, useEffect, useRef, useState } from "react";

export const AUTO_STOP_MIN = 3;
const AUTO_STOP_MS = AUTO_STOP_MIN * 60_000;
const CHECK_MS = 5_000;
const LISTEN_MAX_MS = 30 * 60_000;
// Level sampling for the speech check
const SAMPLE_MS = 100;
const FLOOR_WINDOW = 100; // samples (10 s) the noise floor is learned from
const LEARN_SAMPLES = 20; // first 2 s: learn only
const ABOVE_FLOOR_DB = 10;
const MIN_LEVEL_DB = -65; // never trigger on near-silence
const SPEECH_WINDOW = 30; // 3 s…
const SPEECH_NEEDED = 10; // …with 1 s above the floor (a cough or a door isn't speech)

export type AutoStopState = "off" | "stopped" | "speech";

interface Options {
  enabled: boolean;
  recording: boolean;
  paused: boolean;
  // Changes whenever the transcript does (entries / live tail)
  activity: unknown;
  // Whether the page can open the microphone itself (not in the app)
  canListen: boolean;
  onAutoStop: () => void;
}

export function useAutoStop({ enabled, recording, paused, activity, canListen, onAutoStop }: Options) {
  const [state, setState] = useState<AutoStopState>("off");
  const lastActivity = useRef(0);
  const onAutoStopRef = useRef(onAutoStop);
  useEffect(() => {
    onAutoStopRef.current = onAutoStop;
  }, [onAutoStop]);

  // Every transcript change, a (re)start and a resume count as activity
  useEffect(() => {
    lastActivity.current = Date.now();
  }, [activity, recording, paused]);

  // A new recording clears the notice (adjusted during render, not in an
  // effect)
  const [wasRecording, setWasRecording] = useState(recording);
  if (recording !== wasRecording) {
    setWasRecording(recording);
    if (recording) setState("off");
  }

  useEffect(() => {
    if (!enabled || !recording || paused) return;
    const id = setInterval(() => {
      if (Date.now() - lastActivity.current < AUTO_STOP_MS) return;
      clearInterval(id);
      setState("stopped");
      onAutoStopRef.current();
    }, CHECK_MS);
    return () => clearInterval(id);
  }, [enabled, recording, paused]);

  // Stopped: listen locally for someone speaking
  useEffect(() => {
    if (state !== "stopped" || !canListen) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const release = () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        if (cancelled) return release();
        ctx = new AudioContext();
        if (ctx.state === "suspended") await ctx.resume().catch(() => {});
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const levels: number[] = [];
        const recent: boolean[] = [];
        const started = Date.now();
        timer = setInterval(() => {
          if (Date.now() - started > LISTEN_MAX_MS) return release();
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          const db = 10 * Math.log10(sum / buf.length + 1e-12);
          levels.push(db);
          if (levels.length > FLOOR_WINDOW) levels.shift();
          if (levels.length < LEARN_SAMPLES) return;
          // Noise floor: a low percentile of the last 10 s
          const floor = [...levels].sort((a, b) => a - b)[Math.floor(levels.length * 0.2)];
          recent.push(db > MIN_LEVEL_DB && db > floor + ABOVE_FLOOR_DB);
          if (recent.length > SPEECH_WINDOW) recent.shift();
          if (recent.filter(Boolean).length >= SPEECH_NEEDED) {
            release();
            if (!cancelled) setState("speech");
          }
        }, SAMPLE_MS);
      } catch (error) {
        console.error("[auto-stop] listening failed:", error);
        release();
      }
    })();
    return () => {
      cancelled = true;
      release();
    };
  }, [state, canListen]);

  const dismiss = useCallback(() => setState("off"), []);

  return { state, dismiss };
}
