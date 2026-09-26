import { NextRequest, NextResponse } from "next/server";
import { getOpenRouter } from "@/lib/openrouter";

// Via OpenRouter, from the same ≤ $0.5 / M pool as translation; the second
// model (another vendor) covers a rate-limited first
const SUMMARY_MODELS = ["bytedance-seed/seed-2.0-mini", "google/gemini-2.5-flash-lite"];

interface TranscriptEntry {
  text: string;
  language: string;
  speaker?: string;
  timestamp?: string;
}

const SYSTEM_PROMPT = `你是会议记录助手。根据以下会议转录内容，生成一份简洁的会议摘要。包含：
1. 主要讨论要点
2. 做出的决定
3. 行动项目（如有）

请用会议中使用最多的语言撰写摘要。`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const transcripts: TranscriptEntry[] = body.transcripts;

    // Validate transcripts
    if (!Array.isArray(transcripts) || transcripts.length === 0) {
      return NextResponse.json(
        { error: "Transcripts array is required and must not be empty." },
        { status: 400 }
      );
    }

    // Build formatted transcript string
    const formattedTranscript = transcripts
      .map((entry) => {
        const speaker = entry.speaker ? `[${entry.speaker}]` : "";
        const timestamp = entry.timestamp ? `(${entry.timestamp})` : "";
        const prefix = [timestamp, speaker].filter(Boolean).join(" ");
        return prefix ? `${prefix} ${entry.text}` : entry.text;
      })
      .join("\n");

    let completion;
    for (const [i, model] of SUMMARY_MODELS.entries()) {
      try {
        completion = await getOpenRouter().chat.completions.create({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: formattedTranscript },
          ],
          temperature: 0.5,
          max_tokens: 2000,
          // @ts-expect-error OpenRouter extension: skip thinking
          reasoning: { enabled: false },
        });
        break;
      } catch (error) {
        if (i === SUMMARY_MODELS.length - 1) throw error;
        console.error(`Summary with ${model} failed, falling back:`, error instanceof Error ? error.message : error);
      }
    }

    const summary = completion?.choices[0]?.message?.content?.trim() || "";

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Summarization error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Summarization failed" },
      { status: 500 }
    );
  }
}
