import { NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { adminListMeetings } from "@/lib/meetings/repo";

// Admin (admin_token, checked by middleware): every saved meeting without
// its content — who, when, how long, how big. Titles and text stay private.
export async function GET() {
  if (!meetingsAvailable()) return NextResponse.json({ available: false, meetings: [] });
  try {
    return NextResponse.json({ available: true, meetings: await adminListMeetings() });
  } catch (error) {
    console.error("[meetings] admin list failed:", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
