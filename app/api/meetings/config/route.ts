import { NextRequest, NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { audioMode } from "@/lib/meetings/audio";
import { currentUser } from "@/lib/meetings/repo";
import { verifyToken } from "@/lib/auth";

// What saving can do here: meetings need a database and a real account
// (not a guest); recordings also need file storage. Admins also get the
// environment variables that are missing.
export async function GET(req: NextRequest) {
  const user = meetingsAvailable() ? await currentUser(req) : null;
  const available = !!user;
  const payload = await verifyToken(req.cookies.get("auth_token")?.value ?? "");
  const missing =
    payload?.role === "admin"
      ? [
          ...(meetingsAvailable() ? [] : ["DATABASE_URL (Neon)"]),
          ...(audioMode() ? [] : ["BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN (Vercel Blob)"]),
        ]
      : undefined;
  return NextResponse.json({
    available,
    recordings: available ? audioMode() : null,
    ...(missing ? { missing } : {}),
  });
}
