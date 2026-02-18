import { NextRequest, NextResponse } from "next/server";
import { getMeetingCodes, updateMeetingCodes } from "@/lib/edge-config";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion
  let code = "";
  const array = new Uint32Array(6);
  crypto.getRandomValues(array);
  for (let i = 0; i < 6; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
}

// GET — list active meeting codes (auto-clean expired)
export async function GET() {
  try {
    const codes = await getMeetingCodes();
    const now = Date.now();

    // Split active vs expired
    const active: typeof codes = {};
    let hasExpired = false;
    for (const [code, info] of Object.entries(codes)) {
      if (new Date(info.expiresAt).getTime() > now) {
        active[code] = info;
      } else {
        hasExpired = true;
      }
    }

    // Clean up expired codes from Edge Config
    if (hasExpired) {
      updateMeetingCodes(active).catch(() => {});
    }

    const list = Object.entries(active)
      .map(([code, info]) => ({
        code,
        createdAt: info.createdAt,
        expiresAt: info.expiresAt,
        active: true,
      }))
      .sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    return NextResponse.json({ meetings: list });
  } catch (err) {
    console.error("Get meetings error:", err);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}

// POST — create a new meeting code
export async function POST(request: NextRequest) {
  try {
    const { hours } = await request.json();
    const duration = Math.min(Math.max(Number(hours) || 2, 1), 24);

    const codes = await getMeetingCodes();
    const code = generateCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + duration * 60 * 60 * 1000);

    codes[code] = {
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await updateMeetingCodes(codes);
    return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    console.error("Create meeting error:", err);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}

// DELETE — deactivate a meeting code (set expiry to now)
export async function DELETE(request: NextRequest) {
  try {
    const { code } = await request.json();
    const codes = await getMeetingCodes();

    if (!codes[code]) {
      return NextResponse.json({ error: "会议码不存在" }, { status: 404 });
    }

    // Set expiry to now to invalidate
    codes[code].expiresAt = new Date().toISOString();
    await updateMeetingCodes(codes);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete meeting error:", err);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
