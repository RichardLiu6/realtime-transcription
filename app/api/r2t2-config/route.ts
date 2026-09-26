import { NextResponse } from "next/server";

// Confucius4-R2T2 is self-hosted (vLLM + ws_server.py on a GPU box), so the
// browser connects to it directly. Vercel functions cannot proxy WebSockets.
//
//   R2T2_WS_URL     e.g. wss://asr.example.com/asr_stream_api_v1
//   R2T2_SECRET_KEY must match an entry in secret_key_list in ws_server.py
//
// This route sits behind the auth_token middleware, so only logged-in users
// (and meeting-code guests) can read the key.

function getConfig() {
  const url = process.env.R2T2_WS_URL?.trim();
  const secretKey = process.env.R2T2_SECRET_KEY?.trim();
  if (!url || !secretKey) return null;
  return { url, secretKey };
}

// GET — is the R2T2 engine available? (no secrets)
export async function GET() {
  return NextResponse.json({ enabled: getConfig() !== null });
}

// POST — connection details for starting an R2T2 session
export async function POST() {
  const config = getConfig();
  if (!config) {
    return NextResponse.json(
      { error: "R2T2 is not configured (R2T2_WS_URL / R2T2_SECRET_KEY)" },
      { status: 503 }
    );
  }
  return NextResponse.json(config);
}
