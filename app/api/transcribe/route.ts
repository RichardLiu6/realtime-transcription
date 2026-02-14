import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { ALL_LANGS, LANG_NAMES } from "@/types/languages";

// --------------- Rate Limiter (in-memory, sliding window) ---------------
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // max requests per IP per window
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const requestLog = new Map<string, number[]>();

function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for may contain a comma-separated list; take the first IP
    return forwarded.split(",")[0].trim();
  }
  const realIP = req.headers.get("x-real-ip");
  if (realIP) {
    return realIP.trim();
  }
  return "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Get existing timestamps for this IP, or initialize empty array
  let timestamps = requestLog.get(ip);

  if (!timestamps) {
    timestamps = [];
    requestLog.set(ip, timestamps);
  }

  // Remove expired entries (outside the sliding window)
  const validIndex = timestamps.findIndex((t) => t > windowStart);
  if (validIndex === -1) {
    // All entries expired – clear them
    timestamps.length = 0;
  } else if (validIndex > 0) {
    timestamps.splice(0, validIndex);
  }

  // Check if limit exceeded
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  // Record this request
  timestamps.push(now);
  return false;
}

// Periodically clean up stale IPs to prevent memory leaks (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  for (const [ip, timestamps] of requestLog) {
    // Remove IPs whose last request is older than the window
    if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= windowStart) {
      requestLog.delete(ip);
    }
  }
}, 5 * 60_000);

// --------------- Constants ---------------
const EXPECTED_LANGS = new Set(ALL_LANGS);

const EMPTY_RESPONSE = {
  text: "",
  language: "unknown",
  translations: { zh: "", en: "", es: "" },
};

function normalizeLang(lang: string): string {
  const l = lang.toLowerCase();
  if (l === "chinese" || l === "zh" || l === "mandarin") return "zh";
  if (l === "english" || l === "en") return "en";
  if (l === "spanish" || l === "es" || l === "espanol") return "es";
  return l;
}

export async function POST(req: NextRequest) {
  try {
    // --- Rate limiting ---
    const clientIP = getClientIP(req);
    if (isRateLimited(clientIP)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait." },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const audio = formData.get("audio") as File;

    if (!audio) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // --- File size validation ---
    if (audio.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Audio file too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    const transcription = await openai.audio.transcriptions.create({
      file: audio,
      model: "whisper-1",
      response_format: "verbose_json",
    });

    const text = transcription.text?.trim();

    // Server-side filter 1: empty or too short text
    if (!text || text.length < 2) {
      return NextResponse.json(EMPTY_RESPONSE);
    }

    const detectedLang = normalizeLang(transcription.language || "unknown");

    // Server-side filter 2: reject unexpected languages (hallucination)
    if (!EXPECTED_LANGS.has(detectedLang as typeof ALL_LANGS[number])) {
      return NextResponse.json(EMPTY_RESPONSE);
    }

    const targetLangs = ALL_LANGS.filter((l) => l !== detectedLang);

    const targetLangNames = targetLangs.map((l) => LANG_NAMES[l]);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a translator. Translate the following text to ${targetLangNames[0]} and ${targetLangNames[1]}. Return ONLY a JSON object with keys "${targetLangNames[0]}" and "${targetLangNames[1]}" containing the translations.`,
        },
        { role: "user", content: text },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" },
    });

    const rawJson = completion.choices[0]?.message?.content?.trim() || "{}";

    const translations: Record<string, string> = {
      zh: "",
      en: "",
      es: "",
    };
    translations[detectedLang] = text;

    try {
      const parsed = JSON.parse(rawJson);
      for (let i = 0; i < targetLangs.length; i++) {
        translations[targetLangs[i]] = parsed[targetLangNames[i]] || "";
      }
    } catch {
      // JSON parsing failed – translations stay as empty strings
    }

    return NextResponse.json({
      text,
      language: detectedLang,
      translations,
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
