import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { getOpenRouter } from "@/lib/openrouter";
import { getDashScope } from "@/lib/dashscope";
import { getAnthropic } from "@/lib/anthropic";
import { verifyToken } from "@/lib/auth";
import { getUserModel, getDefaultModel, QWEN_MT_DEFAULT_MODEL, QWEN_DEFAULT_MODEL, QWEN_BACKUP_MODEL, OPENAI_DEFAULT_MODEL, SUPPORTED_MODELS, incrementUsage } from "@/lib/edge-config";
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

// Clause-by-clause translation (client lib/clause/engine.ts): the earlier
// clauses of the sentence are already translated and shown; the model must
// only continue from them
interface Continuation {
  sourceSoFar: string;
  // Translation shown so far, per target language
  translationsSoFar: Record<string, string>;
}

// Accepts {sourceSoFar, translationSoFar} (one target) or
// {sourceSoFar, translationsSoFar: {lang: text}} (several)
function parseContinuation(raw: unknown, targets: string[]): Continuation | undefined {
  const c = raw as { sourceSoFar?: unknown; translationSoFar?: unknown; translationsSoFar?: unknown } | undefined;
  if (!c || typeof c.sourceSoFar !== "string" || !c.sourceSoFar.trim()) return undefined;
  const translationsSoFar: Record<string, string> = {};
  if (typeof c.translationSoFar === "string" && targets.length === 1) {
    translationsSoFar[targets[0]] = c.translationSoFar;
  } else if (c.translationsSoFar && typeof c.translationsSoFar === "object") {
    for (const [lang, text] of Object.entries(c.translationsSoFar as Record<string, unknown>)) {
      if (typeof text === "string") translationsSoFar[lang] = text;
    }
  }
  for (const lang of Object.keys(translationsSoFar)) {
    translationsSoFar[lang] = translationsSoFar[lang].slice(-2000);
    if (!translationsSoFar[lang].trim()) delete translationsSoFar[lang];
  }
  if (Object.keys(translationsSoFar).length === 0) return undefined;
  return { sourceSoFar: c.sourceSoFar.slice(-2000), translationsSoFar };
}

const CONTINUATION_RULES = `The sentence is being translated piece by piece while it is spoken. The earlier part and its translation are already shown to the audience and cannot be changed.
- Translate ONLY the [Next part], so that it reads naturally when appended directly after [Translation so far]
- Do not repeat, revise or re-translate the earlier part
- Output only the new translation text`;

function continuationMessage(c: Continuation, next: string, targetLang: string): string {
  return `[Sentence so far]\n${c.sourceSoFar}\n\n[Translation so far]\n${c.translationsSoFar[targetLang] ?? ""}\n\n[Next part]\n${next}`;
}

// Several targets: one "translation so far" per language (JSON output keys)
function multiContinuationMessage(c: Continuation, next: string, targetLangs: string[]): string {
  const soFar = targetLangs
    .map((l) => `${l}: ${c.translationsSoFar[l] ?? "(nothing yet)"}`)
    .join("\n");
  return `[Sentence so far]\n${c.sourceSoFar}\n\n[Translation so far, per language]\n${soFar}\n\n[Next part]\n${next}`;
}

// Multilingual mode translates into every column, including the language
// being spoken: that column gets the utterance fully in that language, so
// speakers who mix languages still produce a clean version per column
const SAME_LANGUAGE_RULES = `- A target language may be the same as the spoken language. For it, output the utterance entirely in that language: translate any words or phrases from other languages into it, keep the rest as said (do not paraphrase)`;

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
  continuation?: Continuation,
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
${SAME_LANGUAGE_RULES}
${SPEECH_INPUT_RULES}`;

  if (Array.isArray(terms) && terms.length > 0) {
    systemPrompt += `\n\nTerminology — always use these translations when applicable:\n${terms.join(", ")}`;
  }
  // Clause mode: each language's value is only the continuation
  if (continuation) {
    systemPrompt += `\n\n${CONTINUATION_RULES.replace("Translate ONLY the [Next part], so that it reads naturally when appended directly after [Translation so far]", "For each language, translate ONLY the [Next part], so that it reads naturally when appended directly after that language's translation so far")}`;
  }
  const userContent = continuation ? multiContinuationMessage(continuation, text, targetLangs) : text;

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
      { role: "user" as const, content: userContent },
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
      { role: "user", content: userContent },
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
  continuation?: Continuation,
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

  // Clause mode: translate only the next part of a partly translated sentence
  if (continuation) systemPrompt += `\n\n${CONTINUATION_RULES}`;

  const contextMsgs = buildContextMessages(context);
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...contextMsgs,
    { role: "user", content: continuation ? continuationMessage(continuation, text, targetLang) : text },
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
      // Same-language target (multilingual mode): the input is mixed, let
      // the model detect each part
      source_lang: sourceLang && sourceLang !== targetLang ? getLanguageName(sourceLang) : "auto",
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
  continuation?: Continuation,
) {
  const { pairs, vocabulary } = splitTerms(terms);
  // Qwen-MT can't take instructions: give it the sentence so far as a
  // translation-memory pair so the next part stays consistent with it
  if (continuation && sourceLang) {
    memory = [
      ...(memory ?? []),
      { source: continuation.sourceSoFar, sourceLang, translations: continuation.translationsSoFar },
    ];
  }
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

// A provider that answered "out of credits" / "bad key" won't recover within
// a meeting: skip it as a fallback for a while instead of paying a wasted
// round trip on every sentence (per server instance, best effort)
const DEAD_PROVIDER_MS = 10 * 60 * 1000;
const deadUntil = new Map<Provider, number>();

function isAccountFailure(error: unknown): boolean {
  const { status, code, message } = providerError(error);
  if (status === 401 || status === 402 || status === 403) return true;
  return code === "insufficient_quota" || code === "credit_balance_exhausted" || code === "Arrearage" ||
    (status !== 429 && /credit|arrearage/i.test(message)) || /no credits remaining/i.test(message);
}

function markFailure(model: string, error: unknown) {
  if (isAccountFailure(error)) deadUntil.set(providerOf(model), Date.now() + DEAD_PROVIDER_MS);
}

// Models to try, in order, when `model` fails: first another model on the
// same provider (an OpenRouter 429 is usually one upstream model being rate
// limited, not the account), then the other providers — only providers whose
// key is configured and that haven't just reported an account problem
function fallbackModelsFor(model: string): string[] {
  const candidates: [Provider, string, string | undefined][] = [
    ["dashscope", QWEN_MT_DEFAULT_MODEL, process.env.DASHSCOPE_API_KEY],
    ["dashscope", "qwen-mt-flash", process.env.DASHSCOPE_API_KEY],
    ["openrouter", QWEN_DEFAULT_MODEL, process.env.OPENROUTER_API_KEY],
    ["openrouter", QWEN_BACKUP_MODEL, process.env.OPENROUTER_API_KEY],
    ["openai", OPENAI_DEFAULT_MODEL, process.env.OPENAI_API_KEY],
    ["anthropic", "claude-haiku-4-5-20251001", process.env.ANTHROPIC_API_KEY],
  ];
  const primary = providerOf(model);
  const now = Date.now();
  const usable = candidates.filter(
    ([provider, m, key]) => m !== model && !!key && (provider === primary || (deadUntil.get(provider) ?? 0) <= now)
  );
  // Same provider first, then the rest in order
  return [
    ...usable.filter(([p]) => p === primary),
    ...usable.filter(([p]) => p !== primary),
  ].map(([, m]) => m);
}

const PROVIDER_NAME: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  dashscope: "阿里云百炼",
};

const MODEL_NAME: Record<string, string> = {
  "qwen/qwen3.8-flash": "Qwen3.8 Flash",
  "qwen/qwen3.7-plus": "Qwen3.7 Plus",
  "qwen-mt-plus": "Qwen-MT Plus",
  "qwen-mt-flash": "Qwen-MT Flash",
  "gpt-5-nano": "GPT-5 Nano",
  "claude-haiku-4-5-20251001": "Claude Haiku",
};

// Why one model failed, in a few words
function failureReason(error: unknown, model: string): { status: number; code: string; reason: string } {
  const { status, code, message } = providerError(error);
  const provider = PROVIDER_NAME[providerOf(model)];
  if (status === 429 && !/no credits remaining|insufficient_quota/i.test(message + " " + (code ?? ""))) {
    return { status: 429, code: "rate_limit", reason: `${provider} 限流（请求过于频繁）` };
  }
  if (status === 402 || code === "insufficient_quota" || code === "credit_balance_exhausted" || code === "Arrearage" || /credit|arrearage/i.test(message)) {
    return { status: 402, code: "quota", reason: `${provider} 账户额度已用完` };
  }
  if (status === 401 || status === 403) {
    return { status: 502, code: "auth", reason: `${provider} API Key 无效或无权限` };
  }
  if (status !== undefined && status >= 500) {
    return { status: 502, code: "error", reason: `${provider} 服务暂时不可用` };
  }
  return { status: 500, code: "error", reason: "翻译服务出错" };
}

// User-facing message; the client shows it in the error banner. Names the
// model that was actually configured — a failing backup (e.g. an empty
// OpenAI account) must not hide why the default model failed.
function describeFailure(
  primary: { error: unknown; model: string },
  fallback?: { error: unknown; model: string },
): { status: number; body: { error: string; code: string } } {
  const first = failureReason(primary.error, primary.model);
  const name = MODEL_NAME[primary.model] ?? primary.model;
  let text = `翻译失败：${name} — ${first.reason}`;
  if (fallback) {
    const second = failureReason(fallback.error, fallback.model);
    text += `；备用 ${MODEL_NAME[fallback.model] ?? fallback.model} 也失败（${second.reason}）`;
  } else if (first.code === "quota") {
    text += "，请充值或在后台切换翻译模型";
  }
  return { status: first.status, body: { error: text, code: first.code } };
}

export async function POST(req: NextRequest) {
  let model: string = getDefaultModel();
  try {
    const { text, sourceLang, targetLang, targetLangs, context, terms, memory, model: rawRequestedModel, provisional: rawProvisional, continuation: rawContinuation } = await req.json();
    const continuation = parseContinuation(
      rawContinuation,
      Array.isArray(targetLangs) && targetLangs.length > 0 ? targetLangs : typeof targetLang === "string" ? [targetLang] : []
    );
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
        ? handleQwenMT(req, text, sourceLang, isMulti ? targetLangs : [targetLang], isMulti, terms, Array.isArray(memory) ? memory : undefined, m, provisional, responseModel, continuation)
        : isMulti
        // Multi-target path (presentation mode)
        ? handleMultiTarget(req, text, sourceLang, targetLangs, context, terms, m, reasoningOverride, provisional, continuation)
        : handleSingleTarget(req, text, sourceLang, targetLang, context, terms, m, reasoningOverride, provisional, responseModel, continuation);

    try {
      return await run(primary, rawRequestedModel || primary);
    } catch (error) {
      // The compare page asks for a specific model — don't substitute there
      if (rawRequestedModel || !isProviderFailure(error)) throw error;
      markFailure(primary, error);
      let lastError = error;
      let lastModel = primary;
      for (const fallback of fallbackModelsFor(primary)) {
        console.error(`Translation with ${lastModel} failed, falling back to ${fallback}:`, providerError(lastError).message);
        try {
          return await run(fallback, fallback);
        } catch (e) {
          markFailure(fallback, e);
          lastError = e;
          lastModel = fallback;
          if (!isProviderFailure(e)) break;
        }
      }
      console.error("Translation error:", lastError);
      const { status, body } = describeFailure(
        { error, model: primary },
        lastModel !== primary ? { error: lastError, model: lastModel } : undefined,
      );
      return NextResponse.json(body, { status });
    }
  } catch (error) {
    console.error("Translation error:", error);
    const { status, body } = describeFailure({ error, model });
    return NextResponse.json(body, { status });
  }
}
