import { NextRequest, NextResponse } from "next/server";
import { guardMeeting, serverError } from "@/lib/meetings/guard";
import { addRecording } from "@/lib/meetings/repo";
import { audioMode, RECORDING_CONTENT_TYPES } from "@/lib/meetings/audio";
import { parseRecordingPath } from "@/lib/meetings/recordingPath";

type Params = { params: Promise<{ id: string }> };

// Owner: register an uploaded recording (the browser uploads the file
// straight to storage first, then calls this)
export async function POST(req: NextRequest, { params }: Params) {
  const g = await guardMeeting(req, (await params).id, "owner");
  if ("response" in g) return g.response;
  if (!audioMode()) return NextResponse.json({ error: "Recordings not configured" }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const pathname = String(body.pathname ?? "");
  const parsed = parseRecordingPath(pathname);
  const contentType = String(body.contentType ?? "").split(";")[0];
  if (!parsed || parsed.meetingId !== g.id || !RECORDING_CONTENT_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "Bad recording" }, { status: 400 });
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  try {
    await addRecording(g.id, {
      idx: parsed.idx,
      pathname,
      url: typeof body.url === "string" ? body.url.slice(0, 1000) : "",
      contentType,
      sizeBytes: num(body.sizeBytes),
      offsetMs: num(body.offsetMs),
      durationMs: num(body.durationMs),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("register recording", error);
  }
}
