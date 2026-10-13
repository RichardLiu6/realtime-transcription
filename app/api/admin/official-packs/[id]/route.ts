import { NextRequest, NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { cleanLanguages, cleanName } from "@/lib/termPacks";
import { deleteOfficialPack, termsFrom, updateOfficialPack } from "@/lib/officialTerms";

// Admin (admin_token, checked by middleware): rename, switch on/off, replace
// the terms, or add terms (e.g. from a suggestion) to an official pack
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!meetingsAvailable()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const change: Parameters<typeof updateOfficialPack>[1] = {};
  if ("name" in body) {
    const name = cleanName(body.name);
    if (!name) return NextResponse.json({ error: "名称不能为空" }, { status: 400 });
    change.name = name;
  }
  if (typeof body.enabled === "boolean") change.enabled = body.enabled;
  if ("terms" in body) {
    const terms = termsFrom(body.terms);
    if (!terms) return NextResponse.json({ error: "至少保留一个术语" }, { status: 400 });
    change.terms = terms;
  }
  if ("addTerms" in body) {
    const terms = termsFrom(body.addTerms);
    if (!terms) return NextResponse.json({ error: "没有可添加的术语" }, { status: 400 });
    change.addTerms = terms;
    change.addLanguages = cleanLanguages(body.languages);
  }
  try {
    const pack = await updateOfficialPack(id, change);
    return pack ? NextResponse.json({ pack }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    console.error("[official-packs] update failed:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!meetingsAvailable()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const { id } = await params;
  try {
    return (await deleteOfficialPack(id))
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    console.error("[official-packs] delete failed:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
