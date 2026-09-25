import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { getOpenRouter } from "@/lib/openrouter";
import { getDashScope } from "@/lib/dashscope";
import { getAnthropic } from "@/lib/anthropic";
import { verifyToken } from "@/lib/auth";
import { getUserModel, getDefaultModel, QWEN_MT_DEFAULT_MODEL, QWEN_DEFAULT_MODEL, OPENAI_DEFAULT_MODEL, SUPPORTED_MODELS, incrementUsage } from "@/lib/edge-config";
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

// OpenRouter model IDs are vendor-prefixed ("qwen/qwen3.7-plus")
function isOpenRouter(model: string): boolean {
  return model.startsWith("qwen/");
}

// Qwen-MT dedicated translation models on DashScope
function isQwenMT(model: string): boolean {
  return model.startsWith("qwen-mt-");
}

type Provider = "openai" | "anthropic" | "openrouter" | "dashscope";

function providerOf(model: string): Provider {
  if (isClaude(model)) return "anthropic";
  if (isOpenRouter(model)) return "openrouter";
  if (isQwenMT(model)) return "dashscope";
  return "openai";
}

// OpenAI-compatible client for GPT and OpenRouter models
function chatClient(model: string) {
  return isOpenRouter(model) ? getOpenRouter() : getOpenAI();
}

// OpenRouter tuning for live translation:
// - Qwen3.x models may think before answering, which is pure latency here;
//   OpenRouter ignores the field for models that don't reason
// - by default OpenRouter load-balances toward the cheapest provider;
//   sort by latency instead
function applyProviderParams(model: string, params: Record<string, unknown>) {
  if (isOpenRouter(model)) {
    params.reasoning = { enabled: false };
    params.provider = { sort: "latency" };
  }
}

// One line per translation in the Vercel logs, to see where time goes.
// reasoning > 0 means the model "thought" despite being asked not to.
function logTiming(
  model: string,
  latencyMs: number,
  usage: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } | null } | undefined,
  provisional: boolean,
) {
  console.log(
    `[translate] model=${model} ms=${latencyMs} in=${usage?.prompt_tokens ?? 0} out=${usage?.completion_tokens ?? 0}` +
      ` reasoning=${usage?.completion_tokens_details?.reasoning_tokens ?? 0}${provisional ? " provisional" : ""}`
  );
}

// Models may wrap JSON in a ```json fence despite response_format
function parseJsonObject(raw: string): Record<string, string> {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
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

  return getDefaultModel();
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
  // OpenAI-compatible usage (incl. reasoning tokens), for logTiming
  let chatUsage: Parameters<typeof logTiming>[2];

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
    applyProviderParams(model, params);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await chatClient(model).chat.completions.create(params as any);
    chatUsage = r.usage;
    const raw = r.choices[0]?.message?.content?.trim() || "{}";
    translations = parseJsonObject(raw);
    inputTokens = r.usage?.prompt_tokens ?? 0;
    outputTokens = r.usage?.completion_tokens ?? 0;
  }

  const latencyMs = Date.now() - start;
  logTiming(model, latencyMs, chatUsage ?? { prompt_tokens: inputTokens, completion_tokens: outputTokens }, provisional);
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
  // OpenAI-compatible usage (incl. reasoning tokens), for logTiming
  let chatUsage: Parameters<typeof logTiming>[2];

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
    applyProviderParams(model, params);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await chatClient(model).chat.completions.create(params as any);
    chatUsage = r.usage;
    translatedText = r.choices[0]?.message?.content?.trim() || "";
    inputTokens = r.usage?.prompt_tokens ?? 0;
    outputTokens = r.usage?.completion_tokens ?? 0;
  }

  const latencyMs = Date.now() - start;
  logTiming(model, latencyMs, chatUsage ?? { prompt_tokens: inputTokens, completion_tokens: outputTokens }, provisional);
  if (!provisional) trackUsage(req, inputTokens, outputTokens);

  return NextResponse.json({
    translatedText,
    model: responseModel,
    latencyMs,
  });
}

// --- Qwen-MT (DashScope) ---
//
// Qwen-MT takes exactly one user message (no system prompt, no chat
// history); everything else goes in `translation_options`. What the chat
// models get from the prompt is mapped onto its native features:
//   - earlier sentences + their translations → tm_list (translation memory)
//   - "中文=English" term pairs → terms (enforced, both directions)
//   - the plain term list → a domains hint

// Earlier sentences with their translations, sent by the client
interface MemoryItem {
  source: string;
  sourceLang: string;
  translations: Record<string, string>;
}

interface TermPair {
  source: string;
  target: string;
}

// "a=b" entries become pairs (usable in either direction); the rest, plus
// both sides of each pair, form the vocabulary hint
function splitTerms(terms: string[] | undefined): { pairs: TermPair[]; vocabulary: string[] } {
  const pairs: TermPair[] = [];
  const vocabulary: string[] = [];
  for (const raw of terms ?? []) {
    const [a, b] = raw.split("=").map((x) => x.trim());
    if (a && b) {
      pairs.push({ source: a, target: b }, { source: b, target: a });
      vocabulary.push(a, b);
    } else if (a) {
      vocabulary.push(a);
    }
  }
  return { pairs, vocabulary };
}

// Translation-memory pairs oriented source → target, from earlier sentences
// in either direction
function memoryPairs(memory: MemoryItem[] | undefined, src: string | undefined, tgt: string): TermPair[] {
  const pairs: TermPair[] = [];
  for (const m of (memory ?? []).slice(-3)) {
    if (!m?.source || !m.translations) continue;
    if ((!src || m.sourceLang === src) && m.translations[tgt]) {
      pairs.push({ source: m.source, target: m.translations[tgt] });
    } else if (src && m.sourceLang === tgt && m.translations[src]) {
      pairs.push({ source: m.translations[src], target: m.source });
    }
  }
  return pairs;
}

async function translateQwenMT(
  model: string,
  text: string,
  sourceLang: string | undefined,
  targetLang: string,
  vocabulary: string[],
  termPairs: TermPair[],
  memory: MemoryItem[] | undefined,
) {
  let domains =
    "Live spoken business meeting, transcribed by speech recognition in real time: " +
    "the text may contain recognition errors or stop mid-sentence. " +
    "Keep the conversational tone; translate only what was said.";
  if (vocabulary.length > 0) {
    domains += ` Terms that may appear: ${vocabulary.join(", ")}`.slice(0, 1500);
  }
  const tmList = memoryPairs(memory, sourceLang, targetLang);

  const params: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: text }],
    translation_options: {
      source_lang: sourceLang ? getLanguageName(sourceLang) : "auto",
      target_lang: getLanguageName(targetLang),
      domains,
      ...(termPairs.length > 0 ? { terms: termPairs.slice(0, 200) } : {}),
      ...(tmList.length > 0 ? { tm_list: tmList } : {}),
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await getDashScope().chat.completions.create(params as any);
  return {
    text: r.choices[0]?.message?.content?.trim() || "",
    inputTokens: r.usage?.prompt_tokens ?? 0,
    outputTokens: r.usage?.completion_tokens ?? 0,
  };
}

// Single- or multi-target via Qwen-MT: one call per target language, in
// parallel. Same response shape as the chat-model paths.
async function handleQwenMT(
  req: NextRequest,
  text: string,
  sourceLang: string | undefined,
  targetLangs: string[],
  multi: boolean,
  terms: string[] | undefined,
  memory: MemoryItem[] | undefined,
  model: string,
  provisional: boolean,
  responseModel: string,
) {
  const { pairs, vocabulary } = splitTerms(terms);
  const start = Date.now();
  const results = await Promise.all(
    targetLangs.map((t) => translateQwenMT(model, text, sourceLang, t, vocabulary, pairs, memory))
  );
  const latencyMs = Date.now() - start;
  const inputTokens = results.reduce((n, r) => n + r.inputTokens, 0);
  const outputTokens = results.reduce((n, r) => n + r.outputTokens, 0);
  logTiming(model, latencyMs, { prompt_tokens: inputTokens, completion_tokens: outputTokens }, provisional);
  if (!provisional) trackUsage(req, inputTokens, outputTokens);

  if (multi) {
    const translations = Object.fromEntries(targetLangs.map((t, i) => [t, results[i].text]));
    return NextResponse.json({ translations, model: responseModel, latencyMs });
  }
  return NextResponse.json({ translatedText: results[0].text, model: responseModel, latencyMs });
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
  if (status === 401 || status === 402 || status === 403 || status === 429 || status >= 500) return true;
  // Anthropic reports an empty balance as a 400, DashScope an overdue
  // account as 400 "Arrearage"
  return status === 400 && /credit balance|arrearage/i.test(message + " " + (providerError(error).code ?? ""));
}

// Models on the other providers to try, in order, when `model` fails —
// only providers whose key is configured
function fallbackModelsFor(model: string): string[] {
  const candidates: [Provider, string, string | undefined][] = [
    ["dashscope", QWEN_MT_DEFAULT_MODEL, process.env.DASHSCOPE_API_KEY],
    ["openrouter", QWEN_DEFAULT_MODEL, process.env.OPENROUTER_API_KEY],
    ["openai", OPENAI_DEFAULT_MODEL, process.env.OPENAI_API_KEY],
    ["anthropic", "claude-haiku-4-5-20251001", process.env.ANTHROPIC_API_KEY],
  ];
  const primary = providerOf(model);
  return candidates
    .filter(([provider, , key]) => provider !== primary && !!key)
    .map(([, m]) => m);
}

const PROVIDER_NAME: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  dashscope: "阿里云百炼",
};

// User-facing message; the client shows it in the error banner
function describeFailure(error: unknown, model: string): { status: number; body: { error: string; code: string } } {
  const { status, code, message } = providerError(error);
  const provider = PROVIDER_NAME[providerOf(model)];
  if (status === 402 || code === "insufficient_quota" || code === "credit_balance_exhausted" || code === "Arrearage" || /credit|arrearage/i.test(message)) {
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
  let model: string = getDefaultModel();
  try {
    const { text, sourceLang, targetLang, targetLangs, context, terms, memory, model: rawRequestedModel, provisional: rawProvisional } = await req.json();
    const provisional = rawProvisional === true;

    // Parse composite model ID: "gpt-5-nano/low" → model "gpt-5-nano", reasoning "low".
    // Only a known effort suffix counts: OpenRouter IDs contain "/" too
    // ("qwen/qwen3.7-plus").
    let requestedModel = rawRequestedModel;
    let reasoningOverride: string | undefined;
    if (typeof rawRequestedModel === "string") {
      const slash = rawRequestedModel.lastIndexOf("/");
      const effort = rawRequestedModel.slice(slash + 1);
      if (slash > 0 && ["minimal", "low", "medium", "high"].includes(effort)) {
        requestedModel = rawRequestedModel.slice(0, slash);
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

    model = await resolveModel(req, requestedModel);
    const primary = model;
    const run = (m: string, responseModel: string) =>
      isQwenMT(m)
        ? handleQwenMT(req, text, sourceLang, isMulti ? targetLangs : [targetLang], isMulti, terms, Array.isArray(memory) ? memory : undefined, m, provisional, responseModel)
        : isMulti
        // Multi-target path (presentation mode)
        ? handleMultiTarget(req, text, sourceLang, targetLangs, context, terms, m, reasoningOverride, provisional)
        : handleSingleTarget(req, text, sourceLang, targetLang, context, terms, m, reasoningOverride, provisional, responseModel);

    try {
      return await run(primary, rawRequestedModel || primary);
    } catch (error) {
      // The compare page asks for a specific model — don't substitute there
      if (rawRequestedModel || !isProviderFailure(error)) throw error;
      let lastError = error;
      for (const fallback of fallbackModelsFor(primary)) {
        console.error(`Translation with ${model} failed, falling back to ${fallback}:`, providerError(lastError).message);
        model = fallback;
        try {
          return await run(fallback, fallback);
        } catch (e) {
          lastError = e;
          if (!isProviderFailure(e)) break;
        }
      }
      throw lastError;
    }
  } catch (error) {
    console.error("Translation error:", error);
    // `model` is the last one tried, so the message names the right provider
    const { status, body } = describeFailure(error, model);
    return NextResponse.json(body, { status });
  }
}
