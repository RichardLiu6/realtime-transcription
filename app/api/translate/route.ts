import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { ALL_LANGS, LANG_NAMES } from "@/types/languages";

export async function POST(req: NextRequest) {
  try {
    const { text, detectedLang } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const targetLangs = ALL_LANGS.filter((l) => l !== detectedLang);

    const translations: Record<string, string> = {
      zh: "",
      en: "",
      es: "",
    };
    translations[detectedLang] = text;

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
            max_tokens: 1000,
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
      { error: "Translation failed" },
      { status: 500 }
    );
  }
}
