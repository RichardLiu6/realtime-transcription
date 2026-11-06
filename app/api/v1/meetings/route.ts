import { NextRequest, NextResponse } from "next/server";
import { listMeetings } from "@/lib/meetings/repo";
import { serverError } from "@/lib/meetings/guard";
import { apiUser } from "@/lib/apiAuth";

// API (personal token): the user's meetings and those shared with them,
// newest first (≤ 200); ?q= searches titles and text
export async function GET(req: NextRequest) {
  const u = await apiUser(req);
  if ("response" in u) return u.response;
  try {
    const meetings = await listMeetings(u.email, (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100));
    return NextResponse.json({ meetings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("api list", error);
  }
}
