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

function normalizeLang(lang: string): string {
  const l = lang.toLowerCase();
  if (l === "chinese" || l === "zh" || l === "mandarin") return "zh";
  if (l === "english" || l === "en") return "en";
  if (l === "spanish" || l === "es" || l === "espanol") return "es";
  return l;
}

export async function POST(req: NextRequest) {
  // --- Rate limiting ---
  const clientIP = getClientIP(req);
  if (isRateLimited(clientIP)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 }
    );
  }

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

  // --- SSE stream response ---
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const transcription = await openai.audio.transcriptions.create({
          file: audio,
          model: "whisper-1",
          response_format: "verbose_json",
        });

        const text = transcription.text?.trim();

        // Server-side filter 1: empty or too short text
        if (!text || text.length < 2) {
          controller.enqueue(
            encoder.encode(
              `event: transcription\ndata: ${JSON.stringify({ text: "", language: "unknown" })}\n\n`
            )
          );
          controller.close();
          return;
        }

        const detectedLang = normalizeLang(transcription.language || "unknown");

        // Server-side filter 2: reject unexpected languages (hallucination)
        if (!EXPECTED_LANGS.has(detectedLang as (typeof ALL_LANGS)[number])) {
          controller.enqueue(
            encoder.encode(
              `event: transcription\ndata: ${JSON.stringify({ text: "", language: "unknown" })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // --- Send transcription event immediately ---
        controller.enqueue(
          encoder.encode(
            `event: transcription\ndata: ${JSON.stringify({ text, language: detectedLang })}\n\n`
          )
        );

        // --- Run 2 translations in parallel (plain text, faster than JSON mode) ---
        const targetLangs = ALL_LANGS.filter((l) => l !== detectedLang);

        const translations: Record<string, string> = {
          zh: "",
          en: "",
          es: "",
        };
        translations[detectedLang] = text;

        const translationPromises = targetLangs.map(async (targetLang) => {
          try {
            const completion = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: `You are a translator. Translate the following text to ${LANG_NAMES[targetLang]}. Output ONLY the translation, nothing else.`,
                },
                { role: "user", content: text },
              ],
              temperature: 0.3,
              max_tokens: 1000,
            });
            return {
              lang: targetLang,
              text: completion.choices[0]?.message?.content?.trim() || "",
            };
          } catch {
            return { lang: targetLang, text: "" };
          }
        });

        const results = await Promise.all(translationPromises);
        for (const r of results) {
          translations[r.lang] = r.text;
        }

        // --- Send translation event ---
        controller.enqueue(
          encoder.encode(
            `event: translation\ndata: ${JSON.stringify({ translations })}\n\n`
          )
        );

        controller.close();
      } catch (error) {
        console.error("Transcription error:", error);
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : "Transcription failed" })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
