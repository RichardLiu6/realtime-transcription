import { NextRequest, NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { cleanLanguages, cleanName } from "@/lib/termPacks";
import { createOfficialPack, listOfficialPacks, termsFrom } from "@/lib/officialTerms";

// Admin (admin_token, checked by middleware): every official pack / a new one
export async function GET() {
  if (!meetingsAvailable()) return NextResponse.json({ available: false, packs: [] });
  try {
    return NextResponse.json({ available: true, packs: await listOfficialPacks(false) });
  } catch (error) {
    console.error("[official-packs] admin list failed:", error);
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  if (!meetingsAvailable()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const name = cleanName(body.name);
  const terms = termsFrom(body.terms);
  if (!name || !terms) return NextResponse.json({ error: "需要名称和至少一个术语" }, { status: 400 });
  try {
    return NextResponse.json({ pack: await createOfficialPack({ name, languages: cleanLanguages(body.languages), terms }) });
  } catch (error) {
    console.error("[official-packs] create failed:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
