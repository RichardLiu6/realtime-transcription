import { NextRequest, NextResponse } from "next/server";
import { isHostKey } from "@/lib/live/hostKey";
import { liveStore, type LiveBatch } from "@/lib/live/store";
import { ROOM_ID_PATTERN } from "@/lib/live/types";

type Params = { params: Promise<{ room: string }> };

// A publish carries at most this many entries (the host splits larger
// catch-ups) and this much JSON
const MAX_ENTRIES = 200;
const MAX_BODY_BYTES = 900_000;

function isHost(req: NextRequest, room: string): boolean {
  return isHostKey(room, req.headers.get("x-live-host"));
}

// Viewers (public, no login): the room's state, or what changed since a
// version they already have
export async function GET(req: NextRequest, { params }: Params) {
  const { room } = await params;
  if (!ROOM_ID_PATTERN.test(room)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const since = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get("since")) || 0));
  const check = req.nextUrl.searchParams.get("check") === "1";
  try {
    const r = await liveStore().read(room, since, check);
    const headers = { "Cache-Control": "no-store" };
    if (r.kind === "missing") return NextResponse.json({ error: "Not found" }, { status: 404, headers });
    const now = Date.now();
    if (r.kind === "snapshot") {
      return NextResponse.json({ snapshot: true, version: r.version, entries: r.entries, info: r.info, now }, { headers });
    }
    return NextResponse.json({ snapshot: false, version: r.version, batches: r.batches, now }, { headers });
  } catch (error) {
    console.error("[live] read failed:", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}

// Host: publish changed entries and/or the room info
export async function POST(req: NextRequest, { params }: Params) {
  const { room } = await params;
  if (!ROOM_ID_PATTERN.test(room) || !isHost(req, room)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: { entries?: unknown; info?: unknown; reset?: unknown; touch?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (entries.length > MAX_ENTRIES) return NextResponse.json({ error: "Too many entries" }, { status: 413 });

  const now = Date.now();
  const batch: LiveBatch = { at: now };
  if (entries.length > 0) batch.entries = entries;
  if (body.info && typeof body.info === "object") batch.info = { ...body.info, at: now };
  if (body.reset === true) batch.reset = true;
  try {
    const version = await liveStore().publish(room, batch, body.touch === true);
    return NextResponse.json({ version });
  } catch (error) {
    console.error("[live] publish failed:", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}

// Host: stop sharing — viewers watching see it end, the link stops working
export async function DELETE(req: NextRequest, { params }: Params) {
  const { room } = await params;
  if (!ROOM_ID_PATTERN.test(room) || !isHost(req, room)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await liveStore().end(room);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[live] remove failed:", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
