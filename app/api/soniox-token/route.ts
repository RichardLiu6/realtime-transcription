import { NextResponse } from "next/server";

export async function POST() {
  try {
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
