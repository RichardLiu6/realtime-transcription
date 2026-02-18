import { NextRequest, NextResponse } from "next/server";
import { getAuthUsers, updateAuthUsers } from "@/lib/edge-config";

// GET: list all users
export async function GET() {
  try {
    const users = await getAuthUsers();
    const list = Object.entries(users).map(([email, info]) => ({
      email,
      ...info,
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
