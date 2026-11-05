import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/meetings/repo";
import { meetingsAvailable } from "@/lib/meetings/db";
import { cleanName, deletePack, updatePack } from "@/lib/termPacks";
import { cleanTopic } from "@/lib/termPackTypes";

type Params = { params: Promise<{ id: string }> };

// Rename / change the topic of / delete one of the user's own term packs
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!meetingsAvailable()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; topic?: unknown };
  const name = body.name === undefined ? undefined : cleanName(body.name);
  if (name === null || (name === undefined && body.topic === undefined)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const topic = body.topic === undefined ? undefined : cleanTopic(body.topic);
  return (await updatePack(user.email, id, { name, topic }))
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
