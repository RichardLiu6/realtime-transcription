import { NextResponse } from "next/server";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

export async function GET() {
  if (!DEEPGRAM_API_KEY) {
    return NextResponse.json(
      { error: "Deepgram API key not configured" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 600 }), // 10 min TTL
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Deepgram token error:", err);
      return NextResponse.json(
        { error: "Failed to generate token" },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      token: data.access_token,
      expires_in: data.expires_in,
    });
  } catch (error) {
    console.error("Deepgram token error:", error);
    return NextResponse.json(
      { error: "Token generation failed" },
      { status: 500 }
    );
  }
}
