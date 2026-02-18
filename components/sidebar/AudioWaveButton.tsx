"use client";

import { useRef, useEffect, useCallback } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      // Fill down to bottom for layered water-level effect
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fillStyle = `rgba(255, 255, 255, ${wave.opacity})`;
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
    <Button
      onClick={handleClick}
      disabled={isConnecting}
      variant={isRecording ? "destructive" : "default"}
      className="relative w-full h-12 overflow-hidden group"
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${
          isRecording ? "opacity-100" : "opacity-0"
        }`}
        style={{ width: "100%", height: "100%" }}
      />
      <span className="relative z-10 flex items-center justify-center gap-2 group-hover:scale-105 transition-transform">
        {isRecording ? (
          <>
            <Square className="size-4" />
            Stop Recording
          </>
        ) : isConnecting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <Mic className="size-4" />
            Start Recording
          </>
        )}
      </span>
    </Button>
  );
}
