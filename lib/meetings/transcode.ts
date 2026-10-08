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

export async function toAacM4a(input: Uint8Array): Promise<Uint8Array> {
  if (!ffmpegPath) throw new Error("ffmpeg not available");
  const dir = await fs.mkdtemp(path.join(/* turbopackIgnore: true */ os.tmpdir(), "abl-aac-"));
  const src = path.join(/* turbopackIgnore: true */ dir, "in.webm");
  const out = path.join(/* turbopackIgnore: true */ dir, "out.m4a");
  try {
    await fs.writeFile(src, input);
    await new Promise<void>((resolve, reject) => {
      const p = spawn(ffmpegPath as string, [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", src,
        "-vn", "-ac", "1", "-c:a", "aac", "-b:a", AAC_BITRATE,
        // Index at the front: the player can start and seek before the end arrives
        "-movflags", "+faststart",
        out,
      ]);
      let stderr = "";
      p.stderr.on("data", (d) => (stderr += String(d)));
      p.on("error", reject);
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`))));
    });
    return new Uint8Array(await fs.readFile(out));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
