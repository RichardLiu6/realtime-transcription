import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/meetings/repo";
import { meetingsAvailable } from "@/lib/meetings/db";
import { cleanName, deletePack, renamePack } from "@/lib/termPacks";

type Params = { params: Promise<{ id: string }> };

// Rename / delete one of the user's own term packs
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!meetingsAvailable()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const name = cleanName((await req.json().catch(() => ({})))?.name);
  if (!name) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  return (await renamePack(user.email, id, name))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!meetingsAvailable()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return (await deletePack(user.email, id))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
