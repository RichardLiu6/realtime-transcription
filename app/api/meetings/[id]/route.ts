import { NextRequest, NextResponse } from "next/server";
import { guardMeeting, serverError } from "@/lib/meetings/guard";
import { deleteMeetings, getMeeting, updateMeeting } from "@/lib/meetings/repo";
import type { SavedSpeaker } from "@/lib/meetings/types";

type Params = { params: Promise<{ id: string }> };

// The meeting with its sentences and recordings (owner or shared with)
export async function GET(req: NextRequest, { params }: Params) {
  const g = await guardMeeting(req, (await params).id);
  if ("response" in g) return g.response;
  try {
    const meeting = await getMeeting(g.id, g.user.email, g.access);
    if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ meeting }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("get", error);
  }
}

function isSpeakerList(v: unknown): v is SavedSpeaker[] {
  return (
    Array.isArray(v) &&
    v.length <= 100 &&
    v.every((s) => typeof s?.id === "string" && typeof s?.label === "string" && typeof s?.color === "string")
  );
}

// Owner: title, speaker names, summary
export async function PATCH(req: NextRequest, { params }: Params) {
  const g = await guardMeeting(req, (await params).id, "owner");
  if ("response" in g) return g.response;
  let body: { title?: unknown; speakers?: unknown; summary?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const patch: { title?: string; speakers?: SavedSpeaker[]; summary?: string | null } = {};
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 200);
  if (isSpeakerList(body.speakers)) {
    patch.speakers = body.speakers.map((s) => ({ id: s.id, label: s.label.trim().slice(0, 80), color: s.color }));
  }
  if (typeof body.summary === "string" || body.summary === null) {
    patch.summary = body.summary === null ? null : body.summary.slice(0, 50_000);
  }
  try {
    await updateMeeting(g.id, patch);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("update", error);
  }
}

// Owner: delete the meeting and its recordings
export async function DELETE(req: NextRequest, { params }: Params) {
  const g = await guardMeeting(req, (await params).id, "owner");
  if ("response" in g) return g.response;
  try {
    await deleteMeetings([g.id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("delete", error);
  }
}
