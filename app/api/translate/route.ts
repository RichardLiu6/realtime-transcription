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
    const { text, sourceLang, targetLang, context, terms } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }
    if (!targetLang || typeof targetLang !== "string") {
      return NextResponse.json({ error: "Missing targetLang" }, { status: 400 });
    }

    const targetName = getLanguageName(targetLang);
    const sourceName = sourceLang ? getLanguageName(sourceLang) : null;

    // Build system prompt
    let systemPrompt = `You are a real-time meeting translator. Translate spoken ${sourceName || "source language"} to ${targetName}.

Rules:
- Output ONLY the translation, nothing else
- Keep the conversational/spoken tone — do not formalize
- Preserve the speaker's intent, including hedging, filler, and emphasis
- Keep proper nouns, brand names, and technical terms as-is unless a translation is standard`;

    // Add terminology if provided
    if (Array.isArray(terms) && terms.length > 0) {
      systemPrompt += `\n\nTerminology — always use these translations when applicable:\n${terms.join(", ")}`;
    }

    // Build messages with context
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add previous sentences as context
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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
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
