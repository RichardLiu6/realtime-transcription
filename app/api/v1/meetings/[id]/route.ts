import { NextRequest, NextResponse } from "next/server";
import { accessOf, getMeeting } from "@/lib/meetings/repo";
import { serverError } from "@/lib/meetings/guard";
import { meetingMarkdown, meetingText } from "@/lib/meetings/exportMeeting";
import { MEETING_ID_PATTERN } from "@/lib/meetings/types";
import { apiUser } from "@/lib/apiAuth";

// API (personal token): one meeting (owner or shared with), as JSON (with
// every sentence) or ?format=md / txt
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser(req);
  if ("response" in u) return u.response;
  const { id } = await params;
  const notFound = NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!MEETING_ID_PATTERN.test(id)) return notFound;
  try {
    const access = await accessOf(id, u.email);
    if (!access) return notFound;
    const meeting = await getMeeting(id, u.email, access);
    if (!meeting) return notFound;
    const format = req.nextUrl.searchParams.get("format");
    const headers = { "Cache-Control": "no-store" };
    if (format === "md" || format === "txt") {
      return new NextResponse(format === "md" ? meetingMarkdown(meeting) : meetingText(meeting), {
        headers: { ...headers, "Content-Type": `text/${format === "md" ? "markdown" : "plain"}; charset=utf-8` },
      });
    }
    return NextResponse.json({ meeting }, { headers });
  } catch (error) {
    return serverError("api get", error);
  }
}
