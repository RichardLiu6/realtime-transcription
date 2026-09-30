import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { guardMeeting } from "@/lib/meetings/guard";
import { MAX_RECORDING_BYTES, RECORDING_CONTENT_TYPES } from "@/lib/meetings/audio";
import { parseRecordingPath } from "@/lib/meetings/recordingPath";

type Params = { params: Promise<{ id: string }> };

// Owner: a short-lived token for the browser to upload one recording
// straight into the private Blob store (@vercel/blob/client upload())
export async function POST(req: NextRequest, { params }: Params) {
  const g = await guardMeeting(req, (await params).id, "owner");
  if ("response" in g) return g.response;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Recordings not configured" }, { status: 503 });
  }
  try {
    const body = (await req.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (parseRecordingPath(pathname)?.meetingId !== g.id) throw new Error("Bad pathname");
        return {
          allowedContentTypes: RECORDING_CONTENT_TYPES,
          maximumSizeInBytes: MAX_RECORDING_BYTES,
          addRandomSuffix: false,
          allowOverwrite: true,
          validUntil: Date.now() + 30 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[meetings] upload token failed:", error);
    return NextResponse.json({ error: "Upload refused" }, { status: 400 });
  }
}
