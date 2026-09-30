import { NextRequest, NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { cleanupMeetings } from "@/lib/meetings/repo";

// Daily (vercel.json cron): delete meetings past their one-year retention,
// and empty ones, with their recordings. Vercel sends CRON_SECRET as a
// bearer token; without CRON_SECRET the route refuses.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!meetingsAvailable()) return NextResponse.json({ deleted: 0 });
  try {
    return NextResponse.json({ deleted: await cleanupMeetings() });
  } catch (error) {
    console.error("[meetings] cleanup failed:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
