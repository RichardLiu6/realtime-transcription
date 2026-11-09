import { NextRequest, NextResponse } from "next/server";
import { tokenUser } from "@/lib/apiTokens";
import { meetingsAvailable } from "@/lib/meetings/db";
import { withinDailyLimit } from "@/lib/rateLimit";
import { isAuthorizedEmail } from "@/lib/edge-config";

// Requests per token per day (a script can't hammer the database)
const DAILY_LIMIT = 2000;

// `/api/v1/*`: a personal API token instead of the login cookie
export async function apiUser(req: NextRequest): Promise<{ email: string } | { response: NextResponse }> {
  if (!meetingsAvailable()) return { response: NextResponse.json({ error: "Not configured" }, { status: 503 }) };
  const user = await tokenUser(req).catch(() => null);
  if (!user) {
    return {
      response: NextResponse.json(
        { error: "Missing or invalid token: send Authorization: Bearer abl_…" },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
      ),
    };
  }
  // A token outlives the 15-day login: it stops working when its owner is
  // taken off the user list (the admin logs in as "admin", not listed).
  // Without Edge Config (local dev) there is no list to check.
  if (user.email !== "admin" && process.env.EDGE_CONFIG) {
    const listed = await isAuthorizedEmail(user.email).catch(() => null);
    if (listed === null) return { response: NextResponse.json({ error: "Try again later" }, { status: 503 }) };
    if (!listed) {
      return { response: NextResponse.json({ error: "Account no longer has access" }, { status: 403 }) };
    }
  }
  if (!(await withinDailyLimit("api", user.tokenId, DAILY_LIMIT))) {
    return { response: NextResponse.json({ error: "Daily limit reached" }, { status: 429 }) };
  }
  return { email: user.email };
}
