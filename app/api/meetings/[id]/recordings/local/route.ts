import { NextRequest, NextResponse } from "next/server";
import { guardMeeting, serverError } from "@/lib/meetings/guard";
import { audioMode, MAX_RECORDING_BYTES, writeLocal } from "@/lib/meetings/audio";
import { parseRecordingPath } from "@/lib/meetings/recordingPath";

type Params = { params: Promise<{ id: string }> };

// Owner, local server without Blob only (development / tests): store a
// recording as a local file
export async function PUT(req: NextRequest, { params }: Params) {
  const g = await guardMeeting(req, (await params).id, "owner");
  if ("response" in g) return g.response;
  if (audioMode() !== "local") return NextResponse.json({ error: "Not available" }, { status: 404 });
  const pathname = req.nextUrl.searchParams.get("pathname") ?? "";
  if (parseRecordingPath(pathname)?.meetingId !== g.id) {
    return NextResponse.json({ error: "Bad pathname" }, { status: 400 });
  }
  const data = new Uint8Array(await req.arrayBuffer());
  if (data.byteLength > MAX_RECORDING_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413 });
  try {
    await writeLocal(pathname, data);
    return NextResponse.json({ pathname, url: "" });
  } catch (error) {
    return serverError("write recording", error);
  }
}
