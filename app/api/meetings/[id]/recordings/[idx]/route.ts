import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { guardMeeting, serverError } from "@/lib/meetings/guard";
import { recordingFile } from "@/lib/meetings/repo";
import { audioMode, localPath, signedPlaybackUrl } from "@/lib/meetings/audio";

type Params = { params: Promise<{ id: string; idx: string }> };

// Owner or shared with: play a recording. From Blob: a redirect to a
// short-lived signed URL (the player fetches and seeks straight from
// storage); local files are served here, with Range support for seeking.
export async function GET(req: NextRequest, { params }: Params) {
  const { id, idx } = await params;
  const g = await guardMeeting(req, id);
  if ("response" in g) return g.response;
  try {
    const file = await recordingFile(g.id, Number(idx));
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const mode = audioMode();
    if (mode === "blob") {
      const url = await signedPlaybackUrl(file.pathname);
      return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
    }
    if (mode !== "local") return NextResponse.json({ error: "Not configured" }, { status: 503 });

    const data = await fs.readFile(localPath(file.pathname));
    const headers: Record<string, string> = {
      "Content-Type": file.contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
    if (range && (range[1] || range[2])) {
      const size = data.byteLength;
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
      return new NextResponse(data.subarray(start, end + 1), {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
      });
    }
    return new NextResponse(data, { headers: { ...headers, "Content-Length": String(data.byteLength) } });
  } catch (error) {
    return serverError("play recording", error);
  }
}
