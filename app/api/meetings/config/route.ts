import { NextRequest, NextResponse } from "next/server";
import { meetingsAvailable } from "@/lib/meetings/db";
import { audioMode } from "@/lib/meetings/audio";
import { currentUser } from "@/lib/meetings/repo";

// What saving can do here: meetings need a database and a real account
// (not a guest); recordings also need file storage
export async function GET(req: NextRequest) {
  const user = meetingsAvailable() ? await currentUser(req) : null;
  const available = !!user;
  return NextResponse.json({
    available,
    recordings: available ? audioMode() : null,
  });
}
