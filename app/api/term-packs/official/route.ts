import { NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { listOfficialPacks } from "@/lib/officialTerms";

// Official term packs (published by the admin), for everyone signed in,
// guests too — choosing one costs nothing
export async function GET() {
  if (!meetingsAvailable()) return NextResponse.json({ packs: [] });
  try {
    const packs = await listOfficialPacks(true);
    return NextResponse.json({
      packs: packs.map(({ id, name, languages, terms, createdAt }) => ({ id, name, languages, terms, createdAt })),
    });
  } catch (error) {
    console.error("[official-packs] list failed:", error);
    return NextResponse.json({ packs: [] });
  }
}
