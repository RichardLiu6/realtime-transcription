import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

const ALL_LANGS = ["zh", "en", "es"] as const;
const EXPECTED_LANGS = new Set(ALL_LANGS);

const LANG_NAMES: Record<string, string> = {
  zh: "Chinese",
  en: "English",
  es: "Spanish",
};

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
    const formData = await req.formData();
    const audio = formData.get("audio") as File;

    if (!audio) {
      return NextResponse.json(
        { error: "No audio file provided" },
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

    const translationPromises = targetLangs.map(async (targetLang) => {
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
    });

    const translationResults = await Promise.all(translationPromises);

    const translations: Record<string, string> = {
      zh: "",
      en: "",
      es: "",
    };
    translations[detectedLang] = text;
    for (const result of translationResults) {
      translations[result.lang] = result.text;
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
