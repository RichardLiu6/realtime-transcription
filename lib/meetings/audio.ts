// Meeting recordings: files in a private Vercel Blob store; on a local
// server without Blob, files in a local directory (development and tests).
// Server only.
//
// A Blob store connected to the project authenticates one of two ways:
// BLOB_READ_WRITE_TOKEN (older stores), or BLOB_STORE_ID plus the Vercel
// OIDC token the platform provides at runtime (newer stores — no
// read-write token at all). Everything here works with both: uploads use
// presigned URLs (issueSignedToken), not client tokens (which need the
// read-write token).

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { del, issueSignedToken, presignUrl } from "@vercel/blob";

export type AudioMode = "blob" | "local";

export function audioMode(): AudioMode | null {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return "blob";
  return process.env.VERCEL === "1" ? null : "local";
}

// Largest recording accepted (a 3-hour meeting at 32 kbps is ~45 MB)
export const MAX_RECORDING_BYTES = 200 * 1024 * 1024;
export const RECORDING_CONTENT_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"];

export function recordingPathname(meetingId: string, idx: number, contentType: string): string {
  const ext = contentType.includes("mp4") ? "m4a" : contentType.includes("ogg") ? "ogg" : "webm";
  return `meetings/${meetingId}/${idx}.${ext}`;
}

// --- Local files ---

// (turbopackIgnore: a runtime-only directory; without it the build traces
// the whole project into the server functions)
export function localDir(): string {
  return process.env.LOCAL_RECORDINGS_DIR || path.join(/* turbopackIgnore: true */ os.tmpdir(), "abl-recordings");
}

// Pathnames are built by recordingPathname (no user input reaches them
// unchecked), but keep every access inside the directory anyway
export function localPath(pathname: string): string {
  const root = path.resolve(/* turbopackIgnore: true */ localDir());
  const full = path.resolve(/* turbopackIgnore: true */ root, pathname);
  if (!full.startsWith(root + path.sep)) throw new Error("Bad recording path");
  return full;
}

export async function writeLocal(pathname: string, data: Uint8Array): Promise<void> {
  const full = localPath(pathname);
  await fs.mkdir(path.dirname(/* turbopackIgnore: true */ full), { recursive: true });
  await fs.writeFile(full, data);
}

// --- Playback ---

// A short-lived URL the browser's audio player can fetch (and seek in)
// directly from the private store
export async function signedPlaybackUrl(pathname: string): Promise<string> {
  const validUntil = Date.now() + 60 * 60 * 1000;
  const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access: "private", validUntil });
  return presignedUrl;
}

// --- Deletion ---

export async function deleteRecordingFiles(files: { pathname: string; url: string }[]): Promise<void> {
  if (files.length === 0) return;
  const mode = audioMode();
  if (mode === "blob") {
    await del(files.map((f) => f.url || f.pathname));
  } else if (mode === "local") {
    await Promise.all(files.map((f) => fs.rm(localPath(f.pathname), { force: true })));
  }
}
