import { NextRequest, NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { listSuggestions } from "@/lib/officialTerms";

// Admin (admin_token, checked by middleware): anonymous AI term suggestions,
// newest first. ?q= searches title / description / terms; ?download=1 gives
// all of them as a JSON file (to merge elsewhere, e.g. with an assistant)
export async function GET(req: NextRequest) {
  if (!meetingsAvailable()) return NextResponse.json({ available: false, suggestions: [] });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const download = req.nextUrl.searchParams.get("download") === "1";
  try {
    const suggestions = await listSuggestions(q, download ? 5000 : 200);
    if (download) {
      return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), suggestions }, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="term-suggestions-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    }
    return NextResponse.json({ available: true, suggestions });
  } catch (error) {
    console.error("[term-suggestions] admin list failed:", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
