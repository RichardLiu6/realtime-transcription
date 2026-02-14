import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const language = body.language || undefined;

    const secret = await openai.realtime.clientSecrets.create({
      expires_after: {
        anchor: "created_at",
        seconds: 600, // 10 minutes
      },
      session: {
        type: "transcription",
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            noise_reduction: {
              type: "near_field",
            },
            transcription: {
              model: "whisper-1",
              ...(language ? { language } : {}),
              prompt:
                "Transcribe the audio accurately. The speaker may use mixed languages including Chinese, English, and Spanish.",
            },
            turn_detection: {
              type: "server_vad",
              silence_duration_ms: 1500,
              threshold: 0.5,
              prefix_padding_ms: 300,
            },
          },
        },
      },
    });

    return NextResponse.json({
      token: secret.value,
      expires_at: secret.expires_at,
    });
  } catch (error) {
    console.error("Failed to create realtime token:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create session token",
      },
      { status: 500 }
    );
  }
}
