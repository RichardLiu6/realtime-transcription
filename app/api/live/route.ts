import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { verifyToken } from "@/lib/auth";
import { hostKeyFor } from "@/lib/live/hostKey";
import { liveSharingAvailable, liveStore } from "@/lib/live/store";

// Whether caption sharing can be offered (Redis configured, or a local server)
export async function GET() {
  return NextResponse.json({ available: liveSharingAvailable() });
}

// Start sharing (logged-in users only, via middleware): a new room with an
// unguessable id, and the host key that authorizes publishing to it
export async function POST(req: NextRequest) {
  if (!liveSharingAvailable()) {
    return NextResponse.json({ error: "Live sharing is not configured" }, { status: 503 });
  }
  const user = await verifyToken(req.cookies.get("auth_token")?.value ?? "");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const room = randomBytes(16).toString("base64url");
  const hostKey = hostKeyFor(room);
  let info: unknown = null;
  try {
    info = (await req.json())?.info ?? null;
  } catch {
    // no body: the first publish brings the info
  }
  const now = Date.now();
  // The room exists from here on: a viewer opening the link early waits
  // for captions instead of seeing "not found"
  await liveStore().publish(room, { at: now, ...(info ? { info: { ...info, at: now } } : {}) }, true);
  return NextResponse.json({ room, hostKey });
}
