import { NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { listFeedback } from "@/lib/feedback";

// Admin (admin_token, checked by middleware): the latest feedback
export async function GET() {
  if (!meetingsAvailable()) return NextResponse.json({ available: false, feedback: [] });
  try {
    return NextResponse.json({ available: true, feedback: await listFeedback(200) });
  } catch (error) {
    console.error("[feedback] admin list failed:", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
