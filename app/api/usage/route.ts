import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { incrementUsage } from "@/lib/edge-config";

export async function POST(req: NextRequest) {
  try {
    const authToken = req.cookies.get("auth_token")?.value;
    if (!authToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authToken);
    if (!payload?.email || typeof payload.email !== "string") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type, seconds } = await req.json();

    if (type === "stt" && typeof seconds === "number" && seconds > 0) {
      await incrementUsage(payload.email, { stt_seconds: Math.round(seconds) });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
