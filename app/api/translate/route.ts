import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { ALL_LANGS, LANG_NAMES } from "@/types/languages";

export async function POST(req: NextRequest) {
  try {
    const { text, detectedLang } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length < 2) {
      return NextResponse.json(
        { translations: { zh: "", en: "", es: "" } },
        { status: 200 }
      );
    }

    const translations: Record<string, string> = { zh: "", en: "", es: "" };

    // Original language gets the original text
    const normalizedLang = normalizeLang(detectedLang || "");
    if (normalizedLang && ALL_LANGS.includes(normalizedLang as (typeof ALL_LANGS)[number])) {
      translations[normalizedLang] = text;
    }

    // Translate to the other 2 languages in parallel
    const targetLangs = ALL_LANGS.filter((l) => l !== normalizedLang);

    const results = await Promise.all(
      targetLangs.map(async (targetLang) => {
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
            max_tokens: 2000,
          });
          return {
            lang: targetLang,
            text: completion.choices[0]?.message?.content?.trim() || "",
          };
        } catch {
          return { lang: targetLang, text: "" };
        }
      })
    );

    for (const r of results) {
      translations[r.lang] = r.text;
    }

    return NextResponse.json({ translations });
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Translation failed" },
      { status: 500 }
    );
  }
}

function normalizeLang(lang: string): string {
  const l = lang.toLowerCase();
  if (l === "chinese" || l === "zh" || l === "mandarin" || l.startsWith("zh")) return "zh";
  if (l === "english" || l === "en" || l.startsWith("en")) return "en";
  if (l === "spanish" || l === "es" || l === "espanol" || l.startsWith("es")) return "es";
  return l;
}
