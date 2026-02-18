"use client";

import { useRef, useEffect, useCallback } from "react";

interface AudioWaveButtonProps {
  recordingState: "idle" | "connecting" | "recording";
  onStart: () => void;
  onStop: () => void;
  audioAnalyser: AnalyserNode | null;
}

// 3-layer wave configuration
const WAVES = [
  { amplitudeOffset: 0, speedOffset: 0, freqOffset: 0, opacity: 0.3 },
  { amplitudeOffset: 2, speedOffset: 0.005, freqOffset: 0.005, opacity: 0.15 },
  { amplitudeOffset: 4, speedOffset: 0.01, freqOffset: 0.01, opacity: 0.05 },
];

const BASE_AMPLITUDE = 8;
const BASE_SPEED = 0.01;
const BASE_FREQUENCY = 0.02;
const AMP_SENSITIVITY = 10;
const SPEED_SENSITIVITY = 0.04;
const SMOOTHING = 0.95;

export default function AudioWaveButton({
  recordingState,
  onStart,
  onStop,
  audioAnalyser,
}: AudioWaveButtonProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const smoothLoudnessRef = useRef(0);
  const smoothBassRef = useRef(0);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const isRecording = recordingState === "recording";
  const isConnecting = recordingState === "connecting";

  const drawWaves = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // Get audio data
    let loudness = 0;
    let bass = 0;
    if (audioAnalyser && freqDataRef.current) {
      audioAnalyser.getByteFrequencyData(freqDataRef.current);
      const data = freqDataRef.current;
      let sum = 0;
      let bassSum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i];
        if (i < data.length / 4) bassSum += data[i];
      }
      loudness = sum / data.length / 255;
      bass = bassSum / (data.length / 4) / 255;
    }

    smoothLoudnessRef.current =
      SMOOTHING * smoothLoudnessRef.current + (1 - SMOOTHING) * loudness;
    smoothBassRef.current =
      SMOOTHING * smoothBassRef.current + (1 - SMOOTHING) * bass;

    const amp = BASE_AMPLITUDE + smoothLoudnessRef.current * AMP_SENSITIVITY;
    const speed = BASE_SPEED + smoothBassRef.current * SPEED_SENSITIVITY;
    phaseRef.current += speed;

    const centerY = height / 2;

    for (const wave of WAVES) {
      const waveAmp = amp + wave.amplitudeOffset;
      const waveFreq = BASE_FREQUENCY + wave.freqOffset;

      ctx.beginPath();
      ctx.moveTo(0, centerY);
      for (let x = 0; x < width; x++) {
        const y =
          centerY +
          Math.sin(x * waveFreq + phaseRef.current + wave.speedOffset * 100) *
            waveAmp;
        ctx.lineTo(x, y);
      }
      // Fill down to bottom for layered water-level effect (matches Soniox Compare)
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fillStyle = `rgba(0, 0, 0, ${wave.opacity})`;
      ctx.fill();
    }

    animFrameRef.current = requestAnimationFrame(drawWaves);
  }, [audioAnalyser]);

  useEffect(() => {
    if (!isRecording) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      smoothLoudnessRef.current = 0;
      smoothBassRef.current = 0;
      phaseRef.current = 0;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    if (audioAnalyser) {
      freqDataRef.current = new Uint8Array(audioAnalyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    }
    animFrameRef.current = requestAnimationFrame(drawWaves);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isRecording, audioAnalyser, drawWaves]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const handleClick = () => {
    if (isRecording) {
      onStop();
    } else if (!isConnecting) {
      onStart();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isConnecting}
      className={`relative w-full h-14 rounded-xl overflow-hidden transition font-medium text-sm ${
        isRecording
          ? "bg-red-50 text-red-600 hover:bg-red-100"
          : "bg-gray-800 text-white hover:bg-gray-700"
      } disabled:opacity-60`}
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full transition-opacity ${
          isRecording ? "opacity-100" : "opacity-0"
        }`}
        style={{ width: "100%", height: "100%" }}
      />
      <span className="relative z-10 flex items-center justify-center gap-2">
        {isRecording ? (
          <>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
              <rect x="3" y="3" width="10" height="10" rx="1" />
            </svg>
            Stop Recording
          </>
        ) : isConnecting ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Connecting...
          </>
        ) : (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
            Start Recording
          </>
        )}
      </span>
    </button>
  );
}
