import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  type Direction,
  type LatencyMode,
  type TermPair,
  LATENCY_MODES,
  REPETITION_PENALTY,
  SYSTEM_PROMPT,
  buildUserMessage,
  logitBiasFor,
  parseResponse,
  sanitize,
  termPairsFrom,
} from "@/lib/t3po/protocol";

// Simultaneous translation with NetEase Youdao Confucius4-T3PO: one
// WAIT/TRANS step per call. The client (lib/t3po/engine.ts) holds the
// history/buffer state, so this route is stateless.
//
//   T3PO_BASE_URL      OpenAI-compatible endpoint serving the model, e.g. a
//                      self-hosted `vllm serve netease-youdao/Confucius4-T3PO`
//                      at https://gpu.example.com/v1
//   T3PO_API_KEY       optional bearer token (vLLM --api-key, or a proxy)
//   T3PO_MODEL         served model name (default Confucius4-T3PO)
//   T3PO_LATENCY_MODE  low | native | high (default native)

function getConfig() {
  const baseURL = process.env.T3PO_BASE_URL?.trim();
  if (!baseURL) return null;
  const mode = (process.env.T3PO_LATENCY_MODE?.trim().toLowerCase() || "native") as LatencyMode;
  return {
    baseURL: baseURL.replace(/\/+$/, "").replace(/\/chat\/completions$/, ""),
    apiKey: process.env.T3PO_API_KEY?.trim() || "none",
    model: process.env.T3PO_MODEL?.trim() || "Confucius4-T3PO",
    latencyMode: mode in LATENCY_MODES ? mode : "native",
  };
}

let _client: OpenAI | null = null;
function getClient(config: NonNullable<ReturnType<typeof getConfig>>) {
  if (!_client) {
    // No SDK retries: a late step is useless in simultaneous translation
    _client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey, maxRetries: 0, timeout: 15_000 });
  }
  return _client;
}

// GET — is simultaneous translation available?
export async function GET() {
  const config = getConfig();
  return NextResponse.json({ enabled: config !== null, latencyMode: config?.latencyMode ?? null });
}

const MAX_INPUT_CHARS = 4000;
const MAX_HISTORY = 30;

export async function POST(req: NextRequest) {
  const config = getConfig();
  if (!config) {
    return NextResponse.json({ error: "同传翻译未配置（需要 T3PO_BASE_URL）" }, { status: 503 });
  }

  let body: { direction?: unknown; history?: unknown; current?: unknown; force?: unknown; terms?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const direction = body.direction;
  if (direction !== "zh2en" && direction !== "en2zh") {
    return NextResponse.json({ error: "direction must be zh2en or en2zh" }, { status: 400 });
  }
  const current = typeof body.current === "string" ? body.current.slice(0, MAX_INPUT_CHARS) : "";
  if (!current.trim()) {
    return NextResponse.json({ error: "Missing current" }, { status: 400 });
  }
  const history: TermPair[] = (Array.isArray(body.history) ? body.history : [])
    .filter((p): p is [string, string] => Array.isArray(p) && typeof p[0] === "string" && typeof p[1] === "string")
    .slice(-MAX_HISTORY)
    .map(([s, t]) => [sanitize(s), sanitize(t)]);
  const force = body.force === true;
  const terms = termPairsFrom(Array.isArray(body.terms) ? body.terms.filter((t): t is string => typeof t === "string") : []);

  const params: Record<string, unknown> = {
    model: config.model,
    temperature: 0,
    max_tokens: 128,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(direction as Direction, history, current, terms) },
    ],
  };
  // vLLM extension: a forced step must emit something, so it can't WAIT
  if (force) params.min_tokens = 1;
  // Latency operating point; never on a forced step (it must not resolve to WAIT)
  const bias = logitBiasFor(config.latencyMode);
  if (!force && bias) {
    params.logit_bias = bias;
    params.repetition_penalty = REPETITION_PENALTY;
  }

  const start = Date.now();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await getClient(config).chat.completions.create(params as any);
    const result = parseResponse(r.choices[0]?.message?.content);
    const ms = Date.now() - start;
    console.log(`[simul] ${direction} ms=${ms} force=${force} ${result.action} units=${current.length}`);
    return NextResponse.json({ ...result, ms });
  } catch (error) {
    console.error("[simul] step failed:", error);
    return NextResponse.json({ error: "同传翻译服务出错，已改用整句翻译" }, { status: 502 });
  }
}
