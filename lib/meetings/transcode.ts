// WebM → AAC (.m4a) for iPhones and Safari: Chrome's MediaRecorder WebM
// fails there (an error on load, no seeking), AAC plays everywhere. Uses
// the ffmpeg binary from ffmpeg-static (bundled with the recordings route:
// next.config.ts outputFileTracingIncludes). Server only.

import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";

// Speech: mono AAC at 48 kbps is clear and about the size of the original
const AAC_BITRATE = "48k";
// A 3-hour recording converts in well under a minute
const TIMEOUT_MS = 240_000;

export async function toAacM4a(input: Uint8Array): Promise<Uint8Array> {
  if (!ffmpegPath) throw new Error("ffmpeg not available");
  const dir = await fs.mkdtemp(path.join(/* turbopackIgnore: true */ os.tmpdir(), "abl-aac-"));
  const src = path.join(/* turbopackIgnore: true */ dir, "in.webm");
  const out = path.join(/* turbopackIgnore: true */ dir, "out.m4a");
  try {
    await fs.writeFile(src, input);
    await new Promise<void>((resolve, reject) => {
      // The file was uploaded by a user: read it as WebM only (no format
      // guessing — a playlist or concat file could point ffmpeg at other
      // files), from this one local file only, audio only
      const p = spawn(ffmpegPath as string, [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-protocol_whitelist", "file",
        "-f", "matroska",
        "-i", src,
        "-map", "0:a:0", "-vn", "-sn", "-dn",
        "-ac", "1", "-c:a", "aac", "-b:a", AAC_BITRATE,
        // Index at the front: the player can start and seek before the end arrives
        "-movflags", "+faststart",
        out,
      ]);
      let stderr = "";
      const timer = setTimeout(() => p.kill("SIGKILL"), TIMEOUT_MS);
      p.stderr.on("data", (d) => (stderr = (stderr + String(d)).slice(-2000)));
      p.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      p.on("close", (code, signal) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg ${signal ?? `exited ${code}`}: ${stderr.slice(-500)}`));
      });
    });
    return new Uint8Array(await fs.readFile(out));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
