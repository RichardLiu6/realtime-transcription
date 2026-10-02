import { NextRequest, NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { sonioxUsageAvailable, syncSonioxUsage } from "@/lib/sonioxUsage";

// Daily (vercel.json cron): copy Soniox's usage logs, which only reach 91
// days back, so per-user transcription cost stays available. Vercel sends
// CRON_SECRET as a bearer token; without CRON_SECRET the route refuses.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!meetingsAvailable() || !sonioxUsageAvailable()) return NextResponse.json({ synced: false });
  try {
    return NextResponse.json({ synced: true, syncedTo: await syncSonioxUsage() });
  } catch (error) {
    console.error("[usage] Soniox sync failed:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
