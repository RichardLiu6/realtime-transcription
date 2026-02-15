import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const provider: string = body.provider;
    const model: string = body.model;

    if (provider === "soniox") {
      const apiKey = process.env.SONIOX_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "SONIOX_API_KEY not configured" },
          { status: 500 }
        );
      }

      const res = await fetch(
        "https://api.soniox.com/v1/auth/temporary-api-key",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            usage_type: "transcribe_websocket",
            expires_in_seconds: 600,
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        console.error("Soniox token error:", res.status, errText);
        return NextResponse.json(
          { error: `Soniox token request failed: ${res.status}` },
          { status: 500 }
        );
      }

      const data = await res.json();
      return NextResponse.json({ token: data.key });
    }

    if (provider === "openai") {
      // Map arena model id to OpenAI transcription model
      const transcriptionModel =
        model === "gpt-4o-mini-transcribe"
          ? "gpt-4o-mini-transcribe"
          : "gpt-4o-transcribe";

      const secret = await openai.realtime.clientSecrets.create({
        expires_after: {
          anchor: "created_at",
          seconds: 600,
        },
        session: {
          type: "transcription",
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 },
              noise_reduction: { type: "near_field" },
              transcription: {
                model: transcriptionModel,
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
    }

    return NextResponse.json(
      { error: `Unknown provider: ${provider}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("Arena token error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create token",
      },
      { status: 500 }
    );
  }
}
