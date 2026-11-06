import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/meetings/repo";
import { meetingsAvailable } from "@/lib/meetings/db";
import { serverError } from "@/lib/meetings/guard";
import { MAX_TOKENS, TokenLimitError, cleanTokenName, createToken, listTokens } from "@/lib/apiTokens";

// The signed-in user's API tokens (never their values) / a new one, whose
// value is in this answer only. Guests (meeting codes) have none.
export async function GET(req: NextRequest) {
  if (!meetingsAvailable()) return NextResponse.json({ available: false, tokens: [] });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ available: false, tokens: [] });
  try {
    return NextResponse.json({ available: true, max: MAX_TOKENS, tokens: await listTokens(user.email) });
  } catch (error) {
    return serverError("tokens list", error);
  }
}

export async function POST(req: NextRequest) {
  if (!meetingsAvailable()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  try {
    const { token, info } = await createToken(user.email, cleanTokenName(body.name));
    return NextResponse.json({ token, info }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof TokenLimitError) {
      return NextResponse.json({ error: "Limit reached", code: "limit", max: MAX_TOKENS }, { status: 409 });
    }
    return serverError("tokens create", error);
  }
}
