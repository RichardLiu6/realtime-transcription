import { NextRequest, NextResponse } from "next/server";
import { verifyToken, hashOTP, signToken } from "@/lib/auth";
import { getUserByEmail } from "@/lib/edge-config";

export async function POST(request: NextRequest) {
  try {
    const { code, challengeToken } = await request.json();

    if (!code || !challengeToken) {
      return NextResponse.json(
        { error: "请输入验证码" },
        { status: 400 }
      );
    }

    // Verify challenge token
    const payload = await verifyToken(challengeToken);
    if (!payload || !payload.email || !payload.otpHash) {
      return NextResponse.json(
        { error: "验证码已过期，请重新发送" },
        { status: 401 }
      );
    }

    // Verify OTP
    const submittedHash = await hashOTP(code.trim());
    if (submittedHash !== payload.otpHash) {
      return NextResponse.json(
        { error: "验证码错误" },
        { status: 401 }
      );
    }

    // Get user info
    const email = payload.email as string;
    const user = await getUserByEmail(email);
    const name = user?.name || email;

    // Issue 15-day auth token
    const authToken = await signToken({ email, name }, "15d");

    const response = NextResponse.json({ success: true, name });
    response.cookies.set("auth_token", authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 15, // 15 days
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("Verify code error:", err);
    return NextResponse.json(
      { error: "服务异常，请稍后重试" },
      { status: 500 }
    );
  }
}
