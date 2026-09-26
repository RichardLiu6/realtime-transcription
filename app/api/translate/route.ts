import { NextRequest, NextResponse } from "next/server";
import { getOpenRouter } from "@/lib/openrouter";
import { getDashScope } from "@/lib/dashscope";
import { verifyToken } from "@/lib/auth";
import { getUserModel, getDefaultModel, incrementUsage } from "@/lib/edge-config";
import { FALLBACK_CHAIN, isSupportedModel, modelLabel } from "@/lib/models";
import { jwtVerify } from "jose";

function getLanguageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code;
  } catch {
    return code;
  }
}


// Qwen-MT dedicated translation models on DashScope
function isQwenMT(model: string): boolean {
  return model.startsWith("qwen-mt-");
}

// Tencent Hy-MT dedicated translation models (via OpenRouter)
function isHyMT(model: string): boolean {
  return model.startsWith("tencent/hy-mt");
}

type Provider = "openrouter" | "dashscope";

// Everything but Qwen-MT goes through OpenRouter ("vendor/model" IDs)
function providerOf(model: string): Provider {
  return isQwenMT(model) ? "dashscope" : "openrouter";
}

const PROVIDER_KEY: Record<Provider, string> = {
  openrouter: "OPENROUTER_API_KEY",
  dashscope: "DASHSCOPE_API_KEY",
};

// OpenRouter tuning for live translation:
// - reasoning models (Qwen3.x, DeepSeek) may think before answering, which
//   is pure latency here; OpenRouter ignores the field for models that don't
// - by default OpenRouter load-balances toward the cheapest provider;
//   sort by latency instead (it still falls back to the next provider)
function applyProviderParams(params: Record<string, unknown>) {
  params.reasoning = { enabled: false };
  params.provider = { sort: "latency" };
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
  if (isSupportedModel(requestedModel)) {
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
// Same-language column: speakers mix languages on purpose, so foreign words
// may stay — but the reader gets their meaning in brackets
const SAME_LANGUAGE_RULES = `- A target language may be the same as the spoken language. For it, keep the utterance as said (do not paraphrase). Words or phrases from other languages may stay as spoken, but follow each one — on its first occurrence — with its meaning in that language in brackets, using the bracket style of that language (Chinese: full-width （）, others: ( )). Examples: "这个 batch 的 yield 太低了" → "这个 batch（批次）的 yield（良率）太低了"; "Vamos a revisar el budget" → "Vamos a revisar el budget (presupuesto)". Do not gloss acronyms or brand names normally written as-is in that language (FDA, Qwen)`;

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
  // JSON object keyed by language (fence-tolerant parse below)
  const schema = {
    type: "object",
    properties: Object.fromEntries(targetLangs.map((l) => [l, { type: "string" }])),
    required: targetLangs,
    additionalProperties: false,
  };
  const params: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...contextMsgs,
      { role: "user", content: userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "multi_translation", schema, strict: true },
    },
    temperature: 0.3,
    max_tokens: Math.min(200 * targetLangs.length, 4000),
  };
  applyProviderParams(params);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await getOpenRouter().chat.completions.create(params as any);
  const translations = parseJsonObject(r.choices[0]?.message?.content?.trim() || "{}");

  const latencyMs = Date.now() - start;
  logTiming(model, latencyMs, r.usage, provisional);
  // Provisional (partial-sentence) requests are not recorded: usage lives in
  // Edge Config, which is rewritten wholesale per call and can't take the
  // extra write rate. See incrementUsage in lib/edge-config.ts.
  if (!provisional) trackUsage(req, r.usage?.prompt_tokens ?? 0, r.usage?.completion_tokens ?? 0);

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
  const params: Record<string, unknown> = { model, messages, temperature: 0.3, max_tokens: 1000 };
  applyProviderParams(params);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await getOpenRouter().chat.completions.create(params as any);
  const translatedText = r.choices[0]?.message?.content?.trim() || "";

  const latencyMs = Date.now() - start;
  logTiming(model, latencyMs, r.usage, provisional);
  if (!provisional) trackUsage(req, r.usage?.prompt_tokens ?? 0, r.usage?.completion_tokens ?? 0);

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

type PerTargetFn = (targetLang: string) => Promise<{ text: string; inputTokens: number; outputTokens: number }>;

// Single- or multi-target via a dedicated translation model (Qwen-MT,
// Hy-MT): one call per target language, in parallel. Same response shape as
// the chat-model paths.
async function handlePerTarget(
  req: NextRequest,
  targetLangs: string[],
  multi: boolean,
  model: string,
  provisional: boolean,
  responseModel: string,
  translateOne: PerTargetFn,
) {
  const start = Date.now();
  const results = await Promise.all(targetLangs.map(translateOne));
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

// Qwen-MT can't take instructions: the sentence so far (clause mode) goes in
// as a translation-memory pair so the next part stays consistent with it
function qwenMTTranslator(
  model: string,
  text: string,
  sourceLang: string | undefined,
  terms: string[] | undefined,
  memory: MemoryItem[] | undefined,
  continuation: Continuation | undefined,
): PerTargetFn {
  const { pairs, vocabulary } = splitTerms(terms);
  if (continuation && sourceLang) {
    memory = [
      ...(memory ?? []),
      { source: continuation.sourceSoFar, sourceLang, translations: continuation.translationsSoFar },
    ];
  }
  return (t) => translateQwenMT(model, text, sourceLang, t, vocabulary, pairs, memory);
}

// --- Hy-MT (Tencent, via OpenRouter) ---
//
// Hy-MT has no system prompt and is trained on fixed instruction templates
// (huggingface.co/tencent/Hy-MT2-30B-A3B): one user message per target
// language, Chinese template + Chinese language names when Chinese is
// involved, English otherwise. Mapped onto them:
//   - "中文=English" term pairs found in the text → the terminology template
//   - earlier sentences + their translations → the background template
//   - clause mode's sentence so far → the personalization template

function hyMTLanguageName(code: string, zh: boolean): string {
  try {
    return new Intl.DisplayNames([zh ? "zh" : "en"], { type: "language" }).of(code) || code;
  } catch {
    return code;
  }
}

function hyMTPrompt(
  text: string,
  sourceLang: string | undefined,
  targetLang: string,
  termPairs: TermPair[],
  memory: MemoryItem[] | undefined,
  continuation: Continuation | undefined,
): string {
  const zh = sourceLang === "zh" || targetLang === "zh" || /[\u4e00-\u9fff]/.test(text);
  const lang = hyMTLanguageName(targetLang, zh);
  const lower = text.toLowerCase();
  const terms = termPairs.filter((p) => lower.includes(p.source.toLowerCase())).slice(0, 20);
  const history = memoryPairs(memory, sourceLang, targetLang);

  if (continuation) {
    const soFar = continuation.translationsSoFar[targetLang] ?? "";
    const tasks = zh
      ? [
          `【待翻译文本】是一句话的后半部分。前半部分「${continuation.sourceSoFar}」已经译为「${soFar}」，只翻译【待翻译文本】，使译文能直接接在已有译文后面，不要重复或修改前半部分`,
          ...(terms.length > 0 ? [`术语：${terms.map((p) => `${p.source} 翻译成 ${p.target}`).join("；")}`] : []),
          `将【待翻译文本】翻译为${lang}，只输出译文`,
        ]
      : [
          `The [Source Text] is the rest of a sentence. Its beginning "${continuation.sourceSoFar}" is already translated as "${soFar}". Translate only the [Source Text] so that it continues that translation directly; do not repeat or change the beginning`,
          ...(terms.length > 0 ? [`Terminology: ${terms.map((p) => `${p.source} translates to ${p.target}`).join("; ")}`] : []),
          `Translate the [Source Text] into ${lang} and output only the translation`,
        ];
    return zh
      ? `【待翻译文本】\n${text}\n\n【翻译任务】\n${tasks.map((t, i) => `${i + 1}、${t}`).join("\n")}`
      : `[Source Text]\n${text}\n\n[Translation Tasks]\n${tasks.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;
  }

  const termBlock =
    terms.length === 0
      ? ""
      : zh
      ? `参考下面的翻译：\n${terms.map((p) => `${p.source} 翻译成 ${p.target}`).join("\n")}\n`
      : `Reference the following translations:\n${terms.map((p) => `${p.source} translates to ${p.target}`).join("\n")}\n\n`;

  if (history.length > 0) {
    const background = history
      .map((p) => (zh ? `原文：${p.source}\n译文：${p.target}` : `Source: ${p.source}\nTranslation: ${p.target}`))
      .join("\n");
    return zh
      ? `【背景信息】\n${background}\n\n${termBlock}请结合背景信息将以下文本翻译为${lang}，注意只需要输出翻译后的结果，不要额外解释。\n\n【待翻译文本】\n${text}`
      : `[Background Information]\n${background}\n\n${termBlock}Please translate the following text into ${lang}, taking the provided background information into consideration. Only output the translated result without any additional explanation.\n\n[Source Text]\n${text}`;
  }

  return zh
    ? `${termBlock}将以下文本翻译为${lang}，注意只需要输出翻译后的结果，不要额外解释：\n\n${text}`
    : `${termBlock}Translate the following text into ${lang}. Note that you should only output the translated result without any additional explanation:\n\n${text}`;
}

function hyMTTranslator(
  model: string,
  text: string,
  sourceLang: string | undefined,
  terms: string[] | undefined,
  memory: MemoryItem[] | undefined,
  continuation: Continuation | undefined,
): PerTargetFn {
  const { pairs } = splitTerms(terms);
  return async (targetLang) => {
    const params: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: hyMTPrompt(text, sourceLang, targetLang, pairs, memory, continuation) }],
      // Recommended sampling for Hy-MT2-30B-A3B
      temperature: 0.7,
      top_p: 1.0,
      max_tokens: 1000,
    };
    applyProviderParams(params);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await getOpenRouter().chat.completions.create(params as any);
    return {
      text: r.choices[0]?.message?.content?.trim() || "",
      inputTokens: r.usage?.prompt_tokens ?? 0,
      outputTokens: r.usage?.completion_tokens ?? 0,
    };
  };
}

// --- Provider errors & fallback ---

// Status + code from an OpenAI-SDK error (OpenRouter / DashScope)
function providerError(error: unknown): { status?: number; code?: string; message: string } {
  const e = error as { status?: number; code?: string; error?: { type?: string; error?: { type?: string } }; message?: string };
  return {
    status: typeof e?.status === "number" ? e.status : undefined,
    code: e?.code ?? e?.error?.type ?? e?.error?.error?.type,
    message: e?.message ?? String(error),
  };
}

// Out of credits / invalid key / rate limited / model unavailable / provider
// down: worth trying another model. Other bad requests (our fault) are not.
function isProviderFailure(error: unknown): boolean {
  const { status, code, message } = providerError(error);
  // Network error or timeout (OpenAI SDK APIConnectionError / APIConnectionTimeoutError)
  if (status === undefined) return /Connection/.test((error as Error)?.constructor?.name ?? "");
  if (status === 401 || status === 402 || status === 403 || status === 404 || status === 429 || status >= 500) return true;
  // DashScope reports an overdue account as 400 "Arrearage"
  return status === 400 && /arrearage/i.test(message + " " + (code ?? ""));
}

// Out of credits / bad key: the whole provider is unusable, not one model
function isAccountFailure(error: unknown): boolean {
  const { status, code, message } = providerError(error);
  if (status === 401 || status === 402 || status === 403) return true;
  return code === "Arrearage" || /arrearage|insufficient credits/i.test(message);
}

// Models to try, in order, when `model` fails: the fallback chain minus the
// failed model and providers without a key
function fallbackModelsFor(model: string): string[] {
  // A Qwen-MT user first tries the other Qwen-MT model (same account)
  const siblings = isQwenMT(model) ? ["qwen-mt-flash", "qwen-mt-lite"] : [];
  return [...siblings, ...FALLBACK_CHAIN].filter(
    (m) => m !== model && !!process.env[PROVIDER_KEY[providerOf(m)]]
  );
}

const PROVIDER_NAME: Record<Provider, string> = {
  openrouter: "OpenRouter",
  dashscope: "阿里云百炼",
};

// Why one model failed, in a few words
function failureReason(error: unknown, model: string): { status: number; code: string; reason: string } {
  const { status, code, message } = providerError(error);
  const provider = PROVIDER_NAME[providerOf(model)];
  if (status === 429) {
    return { status: 429, code: "rate_limit", reason: "限流（请求过于频繁）" };
  }
  if (status === 402 || code === "Arrearage" || /arrearage|insufficient credits/i.test(message)) {
    return { status: 402, code: "quota", reason: `${provider} 账户额度已用完` };
  }
  if (status === 401 || status === 403) {
    return { status: 502, code: "auth", reason: `${provider} API Key 无效或无权限` };
  }
  if (status === 404) {
    return { status: 502, code: "error", reason: "模型暂不可用" };
  }
  if (status !== undefined && status >= 500) {
    return { status: 502, code: "error", reason: "服务暂时不可用" };
  }
  return { status: 500, code: "error", reason: "翻译服务出错" };
}

// User-facing message; the client shows it in the error banner. Names the
// configured model first — a failing backup must not hide why it failed.
function describeFailure(
  primary: { error: unknown; model: string },
  fallback?: { error: unknown; model: string },
): { status: number; body: { error: string; code: string } } {
  const first = failureReason(primary.error, primary.model);
  let text = `翻译失败：${modelLabel(primary.model)} — ${first.reason}`;
  if (fallback) {
    const second = failureReason(fallback.error, fallback.model);
    text += `；备用 ${modelLabel(fallback.model)} 也失败（${second.reason}）`;
  } else if (first.code === "quota") {
    text += "，请充值";
  }
  return { status: first.status, body: { error: text, code: first.code } };
}

// Only the term pairs this sentence actually uses: with a few presets
// selected the full list is 200+ pairs, which would add thousands of
// tokens (latency and cost) to every call. A pair matches when either side
// appears (Latin sides as whole words, so "Cap" doesn't match "capsule").
// Single terms (names, acronyms) are few and always kept — they also help
// the model repair misrecognized words, which by definition don't match.
const MAX_SINGLE_TERMS = 60;

function termOccurs(term: string, text: string): boolean {
  if (/^[\x20-\x7e]+$/.test(term)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // plural allowed: "batch records" uses "Batch Record"
    return new RegExp(`(^|[^A-Za-z0-9])${escaped}(?:s|es)?($|[^A-Za-z0-9])`, "i").test(text);
  }
  return text.includes(term);
}

function relevantTerms(terms: unknown, text: string): string[] | undefined {
  if (!Array.isArray(terms)) return undefined;
  const pairs: string[] = [];
  const singles: string[] = [];
  for (const raw of terms) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const sides = raw.split("=").map((x) => x.trim()).filter(Boolean);
    if (sides.length >= 2) {
      if (sides.some((side) => termOccurs(side, text))) pairs.push(raw);
    } else if (singles.length < MAX_SINGLE_TERMS) {
      singles.push(raw);
    }
  }
  return [...pairs, ...singles];
}

export async function POST(req: NextRequest) {
  let model: string = getDefaultModel();
  try {
    const { text, sourceLang, targetLang, targetLangs, context, terms: rawTerms, memory, model: rawRequestedModel, provisional: rawProvisional, continuation: rawContinuation } = await req.json();
    const continuation = parseContinuation(
      rawContinuation,
      Array.isArray(targetLangs) && targetLangs.length > 0 ? targetLangs : typeof targetLang === "string" ? [targetLang] : []
    );
    const provisional = rawProvisional === true;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }
    const terms = relevantTerms(rawTerms, continuation ? continuation.sourceSoFar + text : text);

    const isMulti = Array.isArray(targetLangs) && targetLangs.length > 0;
    if (!isMulti && (!targetLang || typeof targetLang !== "string")) {
      return NextResponse.json({ error: "Missing targetLang" }, { status: 400 });
    }

    model = await resolveModel(req, rawRequestedModel);
    const primary = model;
    const memoryItems = Array.isArray(memory) ? (memory as MemoryItem[]) : undefined;
    const run = (m: string, responseModel: string) => {
      const targets: string[] = isMulti ? targetLangs : [targetLang];
      // Dedicated translation models: one call per target language
      if (isQwenMT(m) || isHyMT(m)) {
        const translator = (isQwenMT(m) ? qwenMTTranslator : hyMTTranslator)(m, text, sourceLang, terms, memoryItems, continuation);
        return handlePerTarget(req, targets, isMulti, m, provisional, responseModel, translator);
      }
      return isMulti
        // Multi-target path (presentation mode)
        ? handleMultiTarget(req, text, sourceLang, targetLangs, context, terms, m, provisional, continuation)
        : handleSingleTarget(req, text, sourceLang, targetLang, context, terms, m, provisional, responseModel, continuation);
    };

    try {
      return await run(primary, rawRequestedModel || primary);
    } catch (error) {
      // The compare page asks for a specific model — don't substitute there
      if (rawRequestedModel || !isProviderFailure(error)) throw error;
      // Out of credits / bad key: the provider's other models fail too
      const deadProviders = new Set<Provider>();
      if (isAccountFailure(error)) deadProviders.add(providerOf(primary));
      let lastError = error;
      let lastModel = primary;
      for (const fallback of fallbackModelsFor(primary)) {
        if (deadProviders.has(providerOf(fallback))) continue;
        console.error(`Translation with ${lastModel} failed, falling back to ${fallback}:`, providerError(lastError).message);
        try {
          return await run(fallback, fallback);
        } catch (e) {
          if (isAccountFailure(e)) deadProviders.add(providerOf(fallback));
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
