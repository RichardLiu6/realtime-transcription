import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { getAnthropic } from "@/lib/anthropic";
import { verifyToken } from "@/lib/auth";
import { getUserModel, DEFAULT_MODEL, SUPPORTED_MODELS, incrementUsage } from "@/lib/edge-config";
import { jwtVerify } from "jose";

function getLanguageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code;
  } catch {
    return code;
  }
}

function isClaude(model: string): boolean {
  return model.startsWith("claude-");
}

const REASONING_MODELS = new Set(["gpt-5-mini", "gpt-5-nano"]);
const NO_TEMPERATURE_MODELS = new Set(["gpt-5-mini", "gpt-5-nano"]);
const NEW_API_MODELS = new Set(["gpt-5-mini", "gpt-5-nano", "gpt-5.2"]);

async function isAdmin(req: NextRequest): Promise<boolean> {
  const adminToken = req.cookies.get("admin_token")?.value;
  if (!adminToken) return false;
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || "");
    const { payload } = await jwtVerify(adminToken, secret);
    return !!payload.isAdmin;
  } catch {
    return false;
  }
}

async function resolveModel(req: NextRequest, requestedModel?: string): Promise<string> {
  // Admin can override model (for compare page)
  if (requestedModel && (SUPPORTED_MODELS as readonly string[]).includes(requestedModel)) {
    if (await isAdmin(req)) {
      return requestedModel;
    }
  }

  // Look up user's configured model from Edge Config
  const authToken = req.cookies.get("auth_token")?.value;
  if (authToken) {
    const payload = await verifyToken(authToken);
    if (payload?.email && typeof payload.email === "string") {
      return getUserModel(payload.email);
    }
  }

  return DEFAULT_MODEL;
}

// Input comes from live speech recognition, often mid-sentence
const SPEECH_INPUT_RULES = `- The input is live speech recognition output: it may contain recognition errors (use context to infer the intended words) and may be an unfinished sentence — translate what was said so far, do not complete or guess the rest`;

// Track usage asynchronously (fire-and-forget)
function trackUsage(req: NextRequest, inputTokens: number, outputTokens: number) {
  const authToken = req.cookies.get("auth_token")?.value;
  if (authToken && (inputTokens > 0 || outputTokens > 0)) {
    verifyToken(authToken).then((payload) => {
      if (payload?.email && typeof payload.email === "string") {
        incrementUsage(payload.email, {
          llm_input_tokens: inputTokens,
          llm_output_tokens: outputTokens,
        }).catch(() => {});
      }
    }).catch(() => {});
  }
}

// Build context messages (shared between single and multi-target)
function buildContextMessages(context?: string[]) {
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  if (Array.isArray(context) && context.length > 0) {
    msgs.push({
      role: "user",
      content: `[Context — previous sentences for reference, do NOT translate these]\n${context.join("\n")}`,
    });
    msgs.push({
      role: "assistant",
      content: "(understood, I will use this context for coherent translation)",
    });
  }
  return msgs;
}

// --- Multi-target translation (presentation mode) ---

async function handleMultiTarget(
  req: NextRequest,
  text: string,
  sourceLang: string | undefined,
  targetLangs: string[],
  context: string[] | undefined,
  terms: string[] | undefined,
  model: string,
  reasoningOverride: string | undefined,
  provisional: boolean,
) {
  const sourceName = sourceLang ? getLanguageName(sourceLang) : "source language";
  const targetNames = targetLangs.map((l) => `${l} (${getLanguageName(l)})`).join(", ");

  let systemPrompt = `You are a real-time meeting translator. Translate spoken ${sourceName} into multiple languages simultaneously.

Target languages: ${targetNames}

Rules:
- Output a JSON object with one key per target language code
- Keep the conversational/spoken tone — do not formalize
- Preserve the speaker's intent, including hedging, filler, and emphasis
- Keep proper nouns, brand names, and technical terms as-is unless a translation is standard
${SPEECH_INPUT_RULES}`;

  if (Array.isArray(terms) && terms.length > 0) {
    systemPrompt += `\n\nTerminology — always use these translations when applicable:\n${terms.join(", ")}`;
  }

  const contextMsgs = buildContextMessages(context);
  const start = Date.now();
  let translations: Record<string, string> = {};
  let inputTokens = 0;
  let outputTokens = 0;

  if (isClaude(model)) {
    // Claude: use tool_use for structured output
    const toolSchema = {
      type: "object" as const,
      properties: Object.fromEntries(
        targetLangs.map((l) => [l, { type: "string" as const, description: `Translation in ${getLanguageName(l)}` }])
      ),
      required: targetLangs,
    };

    const anthropicMessages = [
      ...contextMsgs,
      { role: "user" as const, content: text },
    ];

    const r = await getAnthropic().messages.create({
      model,
      max_tokens: Math.min(200 * targetLangs.length, 4000),
      temperature: 0.3,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: [{
        name: "output_translations",
        description: "Output translations for each target language",
        input_schema: toolSchema,
      }],
      tool_choice: { type: "tool" as const, name: "output_translations" },
    });

    const toolBlock = r.content.find((b) => b.type === "tool_use");
    if (toolBlock && toolBlock.type === "tool_use") {
      translations = toolBlock.input as Record<string, string>;
    }
    inputTokens = r.usage?.input_tokens ?? 0;
    outputTokens = r.usage?.output_tokens ?? 0;
  } else {
    // OpenAI: use json_schema structured output
    const schema = {
      type: "object",
      properties: Object.fromEntries(
        targetLangs.map((l) => [l, { type: "string" }])
      ),
      required: targetLangs,
      additionalProperties: false,
    };

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...contextMsgs,
      { role: "user", content: text },
    ];

    const params: Record<string, unknown> = {
      model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: { name: "multi_translation", schema, strict: true },
      },
    };

    if (!NO_TEMPERATURE_MODELS.has(model)) {
      params.temperature = 0.3;
    }
    const tokenLimit = Math.min(200 * targetLangs.length, 4000);
    if (NEW_API_MODELS.has(model)) {
      params.max_completion_tokens = tokenLimit;
    } else {
      params.max_tokens = tokenLimit;
    }
    if (REASONING_MODELS.has(model)) {
      params.reasoning_effort = reasoningOverride || "minimal";
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await getOpenAI().chat.completions.create(params as any);
    const raw = r.choices[0]?.message?.content?.trim() || "{}";
    try {
      translations = JSON.parse(raw);
    } catch {
      translations = {};
    }
    inputTokens = r.usage?.prompt_tokens ?? 0;
    outputTokens = r.usage?.completion_tokens ?? 0;
  }

  const latencyMs = Date.now() - start;
  // Provisional (partial-sentence) requests are not recorded: usage lives in
  // Edge Config, which is rewritten wholesale per call and can't take the
  // extra write rate. See incrementUsage in lib/edge-config.ts.
  if (!provisional) trackUsage(req, inputTokens, outputTokens);

  return NextResponse.json({ translations, model, latencyMs });
}

// --- Single-target translation ---

async function handleSingleTarget(
  req: NextRequest,
  text: string,
  sourceLang: string | undefined,
  targetLang: string,
  context: string[] | undefined,
  terms: string[] | undefined,
  model: string,
  reasoningOverride: string | undefined,
  provisional: boolean,
  responseModel: string,
) {
  const targetName = getLanguageName(targetLang);
  const sourceName = sourceLang ? getLanguageName(sourceLang) : null;

  let systemPrompt = `You are a real-time meeting translator. Translate spoken ${sourceName || "source language"} to ${targetName}.

Rules:
- Output ONLY the translation, nothing else
- Keep the conversational/spoken tone — do not formalize
- Preserve the speaker's intent, including hedging, filler, and emphasis
- Keep proper nouns, brand names, and technical terms as-is unless a translation is standard
${SPEECH_INPUT_RULES}`;

  if (Array.isArray(terms) && terms.length > 0) {
    systemPrompt += `\n\nTerminology — always use these translations when applicable:\n${terms.join(", ")}`;
  }

  const contextMsgs = buildContextMessages(context);
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...contextMsgs,
    { role: "user", content: text },
  ];

  const start = Date.now();
  let translatedText: string;
  let inputTokens = 0;
  let outputTokens = 0;

  if (isClaude(model)) {
    const anthropicMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const r = await getAnthropic().messages.create({
      model,
      max_tokens: 1000,
      temperature: 0.3,
      system: systemPrompt,
      messages: anthropicMessages,
    });
    translatedText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
    inputTokens = r.usage?.input_tokens ?? 0;
    outputTokens = r.usage?.output_tokens ?? 0;
  } else {
    const params: Record<string, unknown> = { model, messages };

    if (!NO_TEMPERATURE_MODELS.has(model)) {
      params.temperature = 0.3;
    }
    if (NEW_API_MODELS.has(model)) {
      params.max_completion_tokens = 1000;
    } else {
      params.max_tokens = 1000;
    }
    if (REASONING_MODELS.has(model)) {
      params.reasoning_effort = reasoningOverride || "minimal";
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await getOpenAI().chat.completions.create(params as any);
    translatedText = r.choices[0]?.message?.content?.trim() || "";
    inputTokens = r.usage?.prompt_tokens ?? 0;
    outputTokens = r.usage?.completion_tokens ?? 0;
  }

  const latencyMs = Date.now() - start;
  if (!provisional) trackUsage(req, inputTokens, outputTokens);

  return NextResponse.json({
    translatedText,
    model: responseModel,
    latencyMs,
  });
}

// --- Provider errors & fallback ---

// Status + code from an OpenAI / Anthropic SDK error
function providerError(error: unknown): { status?: number; code?: string; message: string } {
  const e = error as { status?: number; code?: string; error?: { type?: string; error?: { type?: string } }; message?: string };
  return {
    status: typeof e?.status === "number" ? e.status : undefined,
    code: e?.code ?? e?.error?.type ?? e?.error?.error?.type,
    message: e?.message ?? String(error),
  };
}

// Out of credits / invalid key / rate limited / provider down: worth retrying
// on the other provider. Bad requests (our fault) are not.
function isProviderFailure(error: unknown): boolean {
  const { status, message } = providerError(error);
  if (status === undefined) return false;
  if (status === 401 || status === 403 || status === 429 || status >= 500) return true;
  // Anthropic reports an empty balance as a 400
  return status === 400 && /credit balance/i.test(message);
}

// The other provider's cheapest model, if its key is configured
function fallbackModelFor(model: string): string | null {
  if (isClaude(model)) return process.env.OPENAI_API_KEY ? DEFAULT_MODEL : null;
  return process.env.ANTHROPIC_API_KEY ? "claude-haiku-4-5-20251001" : null;
}

// User-facing message; the client shows it in the error banner
function describeFailure(error: unknown): { status: number; body: { error: string; code: string } } {
  const { status, code, message } = providerError(error);
  const provider = /anthropic|claude/i.test(message) ? "Anthropic" : "OpenAI";
  if (code === "insufficient_quota" || code === "credit_balance_exhausted" || /credit/i.test(message)) {
    return { status: 402, body: { error: `翻译失败：${provider} 账户额度已用完，请充值或在后台切换翻译模型`, code: "quota" } };
  }
  if (status === 401 || status === 403) {
    return { status: 502, body: { error: `翻译失败：${provider} API Key 无效或无权限`, code: "auth" } };
  }
  if (status === 429) {
    return { status: 429, body: { error: `翻译失败：${provider} 请求过于频繁，请稍后再试`, code: "rate_limit" } };
  }
  return { status: 500, body: { error: "翻译失败：翻译服务出错", code: "error" } };
}

export async function POST(req: NextRequest) {
  try {
    const { text, sourceLang, targetLang, targetLangs, context, terms, model: rawRequestedModel, provisional: rawProvisional } = await req.json();
    const provisional = rawProvisional === true;

    // Parse composite model ID: "gpt-5-nano/low" → model "gpt-5-nano", reasoning "low"
    let requestedModel = rawRequestedModel;
    let reasoningOverride: string | undefined;
    if (typeof rawRequestedModel === "string" && rawRequestedModel.includes("/")) {
      const [base, effort] = rawRequestedModel.split("/");
      requestedModel = base;
      if (["minimal", "low", "medium", "high"].includes(effort)) {
        reasoningOverride = effort;
      }
    }

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const isMulti = Array.isArray(targetLangs) && targetLangs.length > 0;
    if (!isMulti && (!targetLang || typeof targetLang !== "string")) {
      return NextResponse.json({ error: "Missing targetLang" }, { status: 400 });
    }

    const model = await resolveModel(req, requestedModel);
    const run = (m: string, responseModel: string) =>
      isMulti
        // Multi-target path (presentation mode)
        ? handleMultiTarget(req, text, sourceLang, targetLangs, context, terms, m, reasoningOverride, provisional)
        : handleSingleTarget(req, text, sourceLang, targetLang, context, terms, m, reasoningOverride, provisional, responseModel);

    try {
      return await run(model, rawRequestedModel || model);
    } catch (error) {
      // The compare page asks for a specific model — don't substitute there
      const fallback = rawRequestedModel ? null : fallbackModelFor(model);
      if (!fallback || !isProviderFailure(error)) throw error;
      console.error(`Translation with ${model} failed, falling back to ${fallback}:`, providerError(error).message);
      return await run(fallback, fallback);
    }
  } catch (error) {
    console.error("Translation error:", error);
    const { status, body } = describeFailure(error);
    return NextResponse.json(body, { status });
  }
}
