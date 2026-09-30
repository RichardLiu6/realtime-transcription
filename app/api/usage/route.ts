import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { trackUsage } from "@/lib/usage";

// Seconds of Soniox transcription, reported by the page when a recording
// stops (R2T2 is self-hosted and not reported)
export async function POST(req: NextRequest) {
  const payload = await verifyToken(req.cookies.get("auth_token")?.value ?? "");
  if (typeof payload?.email !== "string") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { type, seconds } = await req.json();
    // At most a day per report: a bogus value can't inflate the numbers much
    if (type === "stt" && typeof seconds === "number" && seconds > 0) {
      trackUsage(req, { kind: "stt", model: "soniox", seconds: Math.min(Math.round(seconds), 86_400) });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
