import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { isAuthorizedEmail } from "@/lib/edge-config";
import { generateOTP, hashOTP, signToken } from "@/lib/auth";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "请输入邮箱地址" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email is authorized
    const authorized = await isAuthorizedEmail(normalizedEmail);
    if (!authorized) {
      return NextResponse.json(
        { error: "该邮箱未被授权，请联系管理员" },
        { status: 403 }
      );
    }

    // Generate OTP and challenge token
    const otp = generateOTP();
    const otpHash = await hashOTP(otp);
    const challengeToken = await signToken(
      { email: normalizedEmail, otpHash },
      "5m"
    );

    // Send OTP via Resend
    const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const { error } = await getResend().emails.send({
      from: fromAddress,
      to: normalizedEmail,
      subject: "登录验证码 - 实时转录",
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 24px;">
          <h2 style="margin-bottom: 16px;">登录验证码</h2>
          <p style="color: #666; margin-bottom: 24px;">您的验证码是：</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 16px; background: #f5f5f5; border-radius: 8px; margin-bottom: 24px;">
            ${otp}
          </div>
          <p style="color: #999; font-size: 14px;">验证码 5 分钟内有效，请勿分享给他人。</p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: "验证码发送失败，请稍后重试" },
        { status: 500 }
      );
    }

    return NextResponse.json({ challengeToken });
  } catch (err) {
    console.error("Send code error:", err);
    return NextResponse.json(
      { error: "服务异常，请稍后重试" },
      { status: 500 }
    );
  }
}
