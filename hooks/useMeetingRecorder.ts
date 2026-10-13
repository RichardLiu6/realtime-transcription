"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadPresigned } from "@vercel/blob/client";
import fixWebmDuration from "fix-webm-duration";
import {
  addChunk,
  deleteSegment,
  listSegments,
  putSegment,
  segmentBlob,
  type SegmentMeta,
} from "@/lib/meetings/recordingCache";

// Meeting recording (opt-in per meeting): while the microphone is live and
// recording is switched on, MediaRecorder encodes Opus at 32 kbps (~15 MB
// an hour); chunks go to IndexedDB every 5 s. Each start/stop is one
// segment, uploaded when it ends — straight from the browser to the
// private Blob store through a presigned URL (or a local file on a dev
// server) — then registered
// with its place on the transcript timeline.

const CHUNK_MS = 5000;
const BITRATE = 32_000;
const MULTIPART_ABOVE = 8 * 1024 * 1024;
// AAC in MP4 first: it plays everywhere, iPhones included (Chrome's WebM
// fails there); WebM / Ogg only for browsers that can't record MP4
const MIME_TYPES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/ogg;codecs=opus"];

export type RecordingsMode = "blob" | "local";

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

function extensionOf(contentType: string): string {
  return contentType.includes("mp4") ? "m4a" : contentType.includes("ogg") ? "ogg" : "webm";
}

async function uploadSegment(meta: SegmentMeta, mode: RecordingsMode): Promise<void> {
  let blob = await segmentBlob(meta);
  if (blob.size === 0) {
    await deleteSegment(meta.key);
    return;
  }
  // A segment left by a crash has no stop time: estimate it from the size
  const durationMs = meta.stoppedAt
    ? meta.stoppedAt - meta.startedAt - (meta.pausedMs ?? 0)
    : Math.round((blob.size * 8 * 1000) / BITRATE);
  const contentType = meta.mimeType.split(";")[0];
  // MediaRecorder WebM has no duration: players can't show it or seek well
  if (contentType === "audio/webm") blob = await fixWebmDuration(blob, durationMs, { logger: false });
  const pathname = `meetings/${meta.meetingId}/${meta.idx}.${extensionOf(contentType)}`;

  let url = "";
  if (mode === "blob") {
    const result = await uploadPresigned(pathname, blob, {
      access: "private",
      handleUploadUrl: `/api/meetings/${meta.meetingId}/recordings/upload`,
      contentType,
      multipart: blob.size > MULTIPART_ABOVE,
    });
    url = result.url;
  } else {
    const res = await fetch(
      `/api/meetings/${meta.meetingId}/recordings/local?pathname=${encodeURIComponent(pathname)}`,
      { method: "PUT", headers: { "Content-Type": contentType }, body: blob }
    );
    if (res.status === 404) {
      // Meeting deleted meanwhile: nothing to keep
      await deleteSegment(meta.key);
      return;
    }
    if (!res.ok) throw new Error(`upload ${res.status}`);
  }

  const res = await fetch(`/api/meetings/${meta.meetingId}/recordings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pathname, url, contentType, sizeBytes: blob.size, offsetMs: meta.offsetMs, durationMs }),
  });
  if (!res.ok && res.status !== 404) throw new Error(`register ${res.status}`);
  await deleteSegment(meta.key);
}

interface Options {
  meetingId: string | null;
  stream: MediaStream | null;
  enabled: boolean;
  mode: RecordingsMode | null;
  getTranscriptTimeMs: () => number;
  // Recording paused: the audio pauses too, so it stays in step with the
  // transcript timeline (which stops while paused)
  paused?: boolean;
}

export function useMeetingRecorder({ meetingId, stream, enabled, mode, getTranscriptTimeMs, paused = false }: Options) {
  const [active, setActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const nextIdx = useRef(new Map<string, number>());
  const activeKey = useRef<string | null>(null);
  const flushing = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const pause = useRef({ since: 0, total: 0 });

  // Upload every finished segment (and any left by an earlier page), one
  // at a time; failures stay in IndexedDB for the next attempt
  const flush = useCallback(async () => {
    const m = modeRef.current;
    if (!m || flushing.current) return;
    flushing.current = true;
    setUploading(true);
    let anyFailed = false;
    try {
      const segments = (await listSegments()).filter((s) => s.key !== activeKey.current);
      for (const s of segments) {
        try {
          await uploadSegment(s, m);
        } catch (error) {
          console.error("[recording] upload failed, will retry:", error);
          anyFailed = true;
        }
      }
    } catch (error) {
      console.error("[recording] cache unavailable:", error);
      anyFailed = true;
    } finally {
      flushing.current = false;
      setUploading(false);
      setFailed(anyFailed);
    }
  }, []);

  // Leftovers from a crash or a closed tab
  useEffect(() => {
    if (mode) flush();
  }, [mode, flush]);

  useEffect(() => {
    if (!meetingId || !stream || !enabled || !mode) return;
    const mimeType = pickMimeType();
    if (!mimeType) {
      setUnsupported(true);
      return;
    }
    const idx = nextIdx.current.get(meetingId) ?? 1;
    nextIdx.current.set(meetingId, idx + 1);
    const meta: SegmentMeta = {
      key: `${meetingId}:${idx}`,
      meetingId,
      idx,
      mimeType,
      offsetMs: getTranscriptTimeMs(),
      startedAt: Date.now(),
    };
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: BITRATE });
    } catch {
      setUnsupported(true);
      return;
    }
    activeKey.current = meta.key;
    const saved = putSegment(meta);
    const writes: Promise<void>[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) writes.push(saved.then(() => addChunk(meta.key, ev.data)));
    };
    recorder.onstop = async () => {
      const p = pause.current;
      const pausedMs = p.total + (p.since ? Date.now() - p.since : 0);
      try {
        await Promise.all(writes);
        await putSegment({ ...meta, stoppedAt: Date.now(), pausedMs });
      } catch (error) {
        console.error("[recording] cache write failed:", error);
      }
      if (activeKey.current === meta.key) activeKey.current = null;
      flush();
    };
    pause.current = { since: 0, total: 0 };
    recorder.start(CHUNK_MS);
    recorderRef.current = recorder;
    if (pausedRef.current) {
      recorder.pause();
      pause.current.since = Date.now();
    }
    setActive(true);
    return () => {
      recorderRef.current = null;
      setActive(false);
      if (recorder.state !== "inactive") recorder.stop();
    };
  }, [meetingId, stream, enabled, mode, getTranscriptTimeMs, flush]);

  useEffect(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const p = pause.current;
    if (paused && recorder.state === "recording") {
      recorder.pause();
      p.since = Date.now();
    } else if (!paused && recorder.state === "paused") {
      recorder.resume();
      if (p.since) p.total += Date.now() - p.since;
      p.since = 0;
    }
  }, [paused]);

  return { active, uploading, failed, unsupported };
}
