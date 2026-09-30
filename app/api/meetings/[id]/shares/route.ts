import { NextRequest, NextResponse } from "next/server";
import { guardMeeting, serverError } from "@/lib/meetings/guard";
import { addShare, removeShare } from "@/lib/meetings/repo";

type Params = { params: Promise<{ id: string }> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function emailFrom(req: NextRequest): Promise<string | null> {
  try {
    const email = String((await req.json())?.email ?? "").trim().toLowerCase();
    return EMAIL.test(email) && email.length <= 200 ? email : null;
  } catch {
    return null;
  }
}

// Owner: share with a colleague (they see it under 我的会议 once they log in)
export async function POST(req: NextRequest, { params }: Params) {
  const g = await guardMeeting(req, (await params).id, "owner");
  if ("response" in g) return g.response;
  const email = await emailFrom(req);
  if (!email) return NextResponse.json({ error: "Bad email", code: "bad_email" }, { status: 400 });
  if (email === g.user.email) return NextResponse.json({ error: "Own email", code: "own_email" }, { status: 400 });
  try {
    await addShare(g.id, email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("share", error);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const g = await guardMeeting(req, (await params).id, "owner");
  if ("response" in g) return g.response;
  const email = await emailFrom(req);
  if (!email) return NextResponse.json({ error: "Bad email" }, { status: 400 });
  try {
    await removeShare(g.id, email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("unshare", error);
  }
}
