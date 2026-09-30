import { NextRequest, NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { createMeeting, currentUser, listMeetings } from "@/lib/meetings/repo";
import { serverError } from "@/lib/meetings/guard";
import type { MeetingSettings } from "@/lib/meetings/types";

// The user's meetings and those shared with them (?q= searches title and text)
export async function GET(req: NextRequest) {
  if (!meetingsAvailable()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const meetings = await listMeetings(user.email, (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100));
    return NextResponse.json({ meetings });
  } catch (error) {
    return serverError("list", error);
  }
}

// A new meeting (autosave starts one when recording starts)
export async function POST(req: NextRequest) {
  if (!meetingsAvailable()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let settings: Partial<MeetingSettings> = {};
  try {
    const body = await req.json();
    if (body?.settings && typeof body.settings === "object") settings = body.settings;
  } catch {
    // no body
  }
  try {
    const id = await createMeeting(user.email, settings);
    return NextResponse.json({ id });
  } catch (error) {
    return serverError("create", error);
  }
}
