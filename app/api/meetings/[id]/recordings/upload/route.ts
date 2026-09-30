import { NextRequest, NextResponse } from "next/server";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { guardMeeting } from "@/lib/meetings/guard";
import { audioMode, MAX_RECORDING_BYTES, RECORDING_CONTENT_TYPES } from "@/lib/meetings/audio";
import { parseRecordingPath } from "@/lib/meetings/recordingPath";

type Params = { params: Promise<{ id: string }> };

// Owner: a presigned URL for the browser to upload one recording straight
// into the private Blob store (@vercel/blob/client uploadPresigned()).
// Presigned rather than client tokens: works with read-write-token and
// OIDC-connected stores alike (see lib/meetings/audio.ts).
export async function POST(req: NextRequest, { params }: Params) {
  const g = await guardMeeting(req, (await params).id, "owner");
  if ("response" in g) return g.response;
  if (audioMode() !== "blob") {
    return NextResponse.json({ error: "Recordings not configured" }, { status: 503 });
  }
  try {
    const body = (await req.json()) as HandleUploadPresignedBody;
    const result = await handleUploadPresigned({
      body,
      request: req,
      // No upload-completed callbacks are used (the browser registers the
      // recording itself); the key is only needed to verify those, so a
      // callback that shows up anyway fails verification
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || "unused",
      getSignedToken: async (pathname) => {
        if (parseRecordingPath(pathname)?.meetingId !== g.id) throw new Error("Bad pathname");
        const validUntil = Date.now() + 30 * 60 * 1000;
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          validUntil,
          allowedContentTypes: RECORDING_CONTENT_TYPES,
          maximumSizeInBytes: MAX_RECORDING_BYTES,
        });
        return {
          token,
          urlOptions: {
            validUntil,
            allowedContentTypes: RECORDING_CONTENT_TYPES,
            maximumSizeInBytes: MAX_RECORDING_BYTES,
            addRandomSuffix: false,
            allowOverwrite: true,
          },
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[meetings] upload URL failed:", error);
    return NextResponse.json({ error: "Upload refused" }, { status: 400 });
  }
}
