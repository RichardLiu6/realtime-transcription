import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
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
) {
  const sourceName = sourceLang ? getLanguageName(sourceLang) : "source language";
  const targetNames = targetLangs.map((l) => `${l} (${getLanguageName(l)})`).join(", ");

  let systemPrompt = `You are a real-time meeting translator. Translate spoken ${sourceName} into multiple languages simultaneously.

Target languages: ${targetNames}

Rules:
- Output a JSON object with one key per target language code
- Keep the conversational/spoken tone — do not formalize
- Preserve the speaker's intent, including hedging, filler, and emphasis
- Keep proper nouns, brand names, and technical terms as-is unless a translation is standard`;

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
    const r = await openai.chat.completions.create(params as any);
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
  trackUsage(req, inputTokens, outputTokens);

  return NextResponse.json({ translations, model, latencyMs });
}

// --- Single-target translation (existing path) ---

export async function POST(req: NextRequest) {
  try {
    const { text, sourceLang, targetLang, targetLangs, context, terms, model: rawRequestedModel } = await req.json();

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

    const model = await resolveModel(req, requestedModel);

    // Multi-target path (presentation mode)
    if (Array.isArray(targetLangs) && targetLangs.length > 0) {
      return handleMultiTarget(req, text, sourceLang, targetLangs, context, terms, model, reasoningOverride);
    }

    // Single-target path (existing)
    if (!targetLang || typeof targetLang !== "string") {
      return NextResponse.json({ error: "Missing targetLang" }, { status: 400 });
    }

    const targetName = getLanguageName(targetLang);
    const sourceName = sourceLang ? getLanguageName(sourceLang) : null;

    let systemPrompt = `You are a real-time meeting translator. Translate spoken ${sourceName || "source language"} to ${targetName}.

Rules:
- Output ONLY the translation, nothing else
- Keep the conversational/spoken tone — do not formalize
- Preserve the speaker's intent, including hedging, filler, and emphasis
- Keep proper nouns, brand names, and technical terms as-is unless a translation is standard`;

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
      const r = await openai.chat.completions.create(params as any);
      translatedText = r.choices[0]?.message?.content?.trim() || "";
      inputTokens = r.usage?.prompt_tokens ?? 0;
      outputTokens = r.usage?.completion_tokens ?? 0;
    }

    const latencyMs = Date.now() - start;
    trackUsage(req, inputTokens, outputTokens);

    return NextResponse.json({
      translatedText,
      model: rawRequestedModel || model,
      latencyMs,
    });
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    );
  }
}
