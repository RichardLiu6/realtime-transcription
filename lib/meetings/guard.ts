// Route helpers for saved meetings. Server only.

import { NextRequest, NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { accessOf, currentUser, type Access, type User } from "@/lib/meetings/repo";
import { MEETING_ID_PATTERN } from "@/lib/meetings/types";

export type Guarded = { user: User; access: Access; id: string } | { response: NextResponse };

// The current user's access to meeting `id`: 503 without a database, 401
// without a (non-guest) login, 404 when missing or not theirs — the same
// answer, so ids can't be probed. `need: "owner"` for changes.
export async function guardMeeting(req: NextRequest, id: string, need: Access | "any" = "any"): Promise<Guarded> {
  if (!meetingsAvailable()) return { response: NextResponse.json({ error: "Not configured" }, { status: 503 }) };
  const user = await currentUser(req);
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const access = MEETING_ID_PATTERN.test(id) ? await accessOf(id, user.email) : null;
  if (!access || (need === "owner" && access !== "owner")) {
    return { response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { user, access, id };
}

export function serverError(where: string, error: unknown): NextResponse {
  console.error(`[meetings] ${where} failed:`, error);
  return NextResponse.json({ error: "Unavailable" }, { status: 503 });
}
