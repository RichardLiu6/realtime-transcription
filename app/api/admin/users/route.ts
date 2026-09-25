import { NextRequest, NextResponse } from "next/server";
import { getAuthUsers, updateAuthUsers, SUPPORTED_MODELS, type MonthlyUsage } from "@/lib/edge-config";
import { getUsageForUsers } from "@/lib/usage";

// Sum legacy Edge Config usage (frozen, pre-Redis) with live Redis counters
function mergeUsage(
  legacy: Record<string, MonthlyUsage> = {},
  live: Record<string, MonthlyUsage> = {}
): Record<string, MonthlyUsage> {
  const merged: Record<string, MonthlyUsage> = { ...legacy };
  for (const [month, u] of Object.entries(live)) {
    const prev = merged[month];
    merged[month] = prev
      ? {
          stt_seconds: prev.stt_seconds + u.stt_seconds,
          llm_input_tokens: prev.llm_input_tokens + u.llm_input_tokens,
          llm_output_tokens: prev.llm_output_tokens + u.llm_output_tokens,
        }
      : u;
  }
  return merged;
}

// GET: list all users
export async function GET() {
  try {
    const users = await getAuthUsers();
    const emails = Object.keys(users);
    const liveUsage = await getUsageForUsers(emails).catch((err) => {
      console.error("Read usage error:", err);
      return {} as Awaited<ReturnType<typeof getUsageForUsers>>;
    });
    const list = Object.entries(users).map(([email, info]) => ({
      email,
      ...info,
      usage: mergeUsage(info.usage, liveUsage[email]),
    }));
    return NextResponse.json({ users: list });
  } catch (err) {
    console.error("List users error:", err);
    return NextResponse.json(
      { error: "获取用户列表失败" },
      { status: 500 }
    );
  }
}

// POST: add user
export async function POST(request: NextRequest) {
  try {
    const { email, name } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "请输入邮箱地址" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const users = await getAuthUsers();

    if (normalizedEmail in users) {
      return NextResponse.json(
        { error: "该邮箱已存在" },
        { status: 409 }
      );
    }

    users[normalizedEmail] = {
      name: name?.trim() || normalizedEmail.split("@")[0],
      addedAt: new Date().toISOString().split("T")[0],
    };

    await updateAuthUsers(users);

    return NextResponse.json({
      success: true,
      user: { email: normalizedEmail, ...users[normalizedEmail] },
    });
  } catch (err) {
    console.error("Add user error:", err);
    return NextResponse.json(
      { error: "添加用户失败" },
      { status: 500 }
    );
  }
}

// PATCH: update user model
export async function PATCH(request: NextRequest) {
  try {
    const { email, model } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "请指定邮箱" }, { status: 400 });
    }

    if (model && !(SUPPORTED_MODELS as readonly string[]).includes(model)) {
      return NextResponse.json({ error: "不支持的模型" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const users = await getAuthUsers();

    if (!(normalizedEmail in users)) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    if (model) {
      users[normalizedEmail].model = model;
    } else {
      delete users[normalizedEmail].model;
    }

    await updateAuthUsers(users);

    return NextResponse.json({ success: true, user: { email: normalizedEmail, ...users[normalizedEmail] } });
  } catch (err) {
    console.error("Update user model error:", err);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

// DELETE: remove user
export async function DELETE(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "请指定邮箱" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const users = await getAuthUsers();

    if (!(normalizedEmail in users)) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      );
    }

    delete users[normalizedEmail];
    await updateAuthUsers(users);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete user error:", err);
    return NextResponse.json(
      { error: "删除用户失败" },
      { status: 500 }
    );
  }
}
