import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { getAnthropic } from "@/lib/anthropic";
import { verifyToken } from "@/lib/auth";
import { getUserModel, DEFAULT_MODEL, SUPPORTED_MODELS } from "@/lib/edge-config";
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

export async function POST(req: NextRequest) {
  try {
    const { text, sourceLang, targetLang, context, terms, model: requestedModel } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }
    if (!targetLang || typeof targetLang !== "string") {
      return NextResponse.json({ error: "Missing targetLang" }, { status: 400 });
    }

    const model = await resolveModel(req, requestedModel);
    const targetName = getLanguageName(targetLang);
    const sourceName = sourceLang ? getLanguageName(sourceLang) : null;

    // Build system prompt
    let systemPrompt = `You are a real-time meeting translator. Translate spoken ${sourceName || "source language"} to ${targetName}.

Rules:
- Output ONLY the translation, nothing else
- Keep the conversational/spoken tone — do not formalize
- Preserve the speaker's intent, including hedging, filler, and emphasis
- Keep proper nouns, brand names, and technical terms as-is unless a translation is standard`;

    if (Array.isArray(terms) && terms.length > 0) {
      systemPrompt += `\n\nTerminology — always use these translations when applicable:\n${terms.join(", ")}`;
    }

    // Build messages with context
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    if (Array.isArray(context) && context.length > 0) {
      messages.push({
        role: "user",
        content: `[Context — previous sentences for reference, do NOT translate these]\n${context.join("\n")}`,
      });
      messages.push({
        role: "assistant",
        content: "(understood, I will use this context for coherent translation)",
      });
    }

    messages.push({ role: "user", content: text });

    const start = Date.now();
    let translatedText: string;

    if (isClaude(model)) {
      // Anthropic: system is a separate param, not in messages
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
    } else {
      // OpenAI
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
        params.reasoning_effort = "minimal";
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await openai.chat.completions.create(params as any);
      translatedText = r.choices[0]?.message?.content?.trim() || "";
    }

    const latencyMs = Date.now() - start;

    return NextResponse.json({ translatedText, model, latencyMs });
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    );
  }
}
