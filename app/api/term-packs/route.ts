import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/meetings/repo";
import { meetingsAvailable } from "@/lib/meetings/db";
import { MAX_PACKS, PackLimitError, cleanLanguages, cleanName, cleanTerms, createPack, listPacks } from "@/lib/termPacks";

// The user's own term packs (AI-suggested terms saved under a name). Guests
// (meeting codes) have none.
export async function GET(req: NextRequest) {
  if (!meetingsAvailable()) return NextResponse.json({ available: false, packs: [] });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ available: false, packs: [] });
  try {
    return NextResponse.json({ available: true, max: MAX_PACKS, packs: await listPacks(user.email) });
  } catch (error) {
    console.error("[term-packs] list failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!meetingsAvailable()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { name?: unknown; languages?: unknown; terms?: unknown; replaceId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request", code: "invalid" }, { status: 400 });
  }
  const name = cleanName(body.name);
  const terms = cleanTerms(body.terms);
  if (!name || !terms) return NextResponse.json({ error: "Invalid request", code: "invalid" }, { status: 400 });
  const replaceId = typeof body.replaceId === "string" ? body.replaceId : undefined;
  try {
    const pack = await createPack(user.email, { name, languages: cleanLanguages(body.languages), terms }, replaceId);
    return NextResponse.json({ pack });
  } catch (error) {
    if (error instanceof PackLimitError) {
      return NextResponse.json({ error: "Limit reached", code: "limit", max: MAX_PACKS }, { status: 409 });
    }
    console.error("[term-packs] create failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
