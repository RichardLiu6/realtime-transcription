import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/meetings/repo";
import { meetingsAvailable } from "@/lib/meetings/db";
import { serverError } from "@/lib/meetings/guard";
import { revokeToken } from "@/lib/apiTokens";

// Revoke one of the user's API tokens (it stops working at once)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!meetingsAvailable()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return (await revokeToken(user.email, (await params).id))
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return serverError("tokens revoke", error);
  }
}
