import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

function getLanguageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code;
  } catch {
    return code;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { text, sourceLang, targetLang } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }
    if (!targetLang || typeof targetLang !== "string") {
      return NextResponse.json({ error: "Missing targetLang" }, { status: 400 });
    }

    const targetName = getLanguageName(targetLang);
    const sourceName = sourceLang ? getLanguageName(sourceLang) : null;

    const systemPrompt = sourceName
      ? `You are a translator. Translate the following ${sourceName} text to ${targetName}. Output ONLY the translation, nothing else.`
      : `You are a translator. Translate the following text to ${targetName}. Output ONLY the translation, nothing else.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const translatedText = completion.choices[0]?.message?.content?.trim() || "";

    return NextResponse.json({ translatedText });
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    );
  }
}
