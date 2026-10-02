import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { sonioxClientRef } from "@/lib/sonioxUsage";

// A 10-minute key for the browser's WebSocket. It carries the user's email
// as client_reference_id, so Soniox's usage logs (lib/sonioxUsage.ts)
// attribute each transcription's cost to them
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.SONIOX_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "SONIOX_API_KEY not configured" },
        { status: 500 }
      );
    }

    const payload = await verifyToken(req.cookies.get("auth_token")?.value ?? "");
    const email = typeof payload?.email === "string" ? payload.email : "";

    const res = await fetch(
      `${process.env.SONIOX_API_BASE_URL || "https://api.soniox.com"}/v1/auth/temporary-api-key`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          usage_type: "transcribe_websocket",
          expires_in_seconds: 600,
          ...(email ? { client_reference_id: sonioxClientRef(email) } : {}),
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
    return NextResponse.json({ api_key: data.api_key });
  } catch (error) {
    console.error("Soniox token error:", error);
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
