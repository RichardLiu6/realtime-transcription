import { NextRequest, NextResponse } from "next/server";
import { agentGuide } from "@/lib/agentGuide";

// How AI agents read meetings through /api/v1 (the llms.txt convention).
// Public, no token in it. The base URL is the host it was asked on.
export function GET(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return new NextResponse(agentGuide(`${proto}://${host}`), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
