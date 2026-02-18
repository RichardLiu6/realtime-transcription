import { NextRequest, NextResponse } from "next/server";
import { getMeetingCodes } from "@/lib/edge-config";
import { signToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "请输入会议码" }, { status: 400 });
    }

    const normalizedCode = code.trim().toUpperCase();
    const codes = await getMeetingCodes();
    const meeting = codes[normalizedCode];

    if (!meeting) {
      return NextResponse.json({ error: "会议码无效" }, { status: 401 });
    }

    const expiresAt = new Date(meeting.expiresAt).getTime();
    const now = Date.now();

    if (expiresAt <= now) {
      return NextResponse.json({ error: "会议码已过期" }, { status: 401 });
    }

    // Calculate remaining time in seconds for token expiry
    const remainingSeconds = Math.floor((expiresAt - now) / 1000);
    const authToken = await signToken(
      { email: "guest", name: "Guest", role: "guest", meetingCode: normalizedCode },
      `${remainingSeconds}s`
    );

    const response = NextResponse.json({ success: true });
    response.cookies.set("auth_token", authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: remainingSeconds,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("Join meeting error:", err);
    return NextResponse.json({ error: "服务异常" }, { status: 500 });
  }
}
