import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

interface TranscriptEntry {
  text: string;
  language: string;
  speaker?: string | number;
  timestamp?: string;
}

const SYSTEM_PROMPT = `你是会议记录助手。根据以下会议转录内容，生成一份简明的会议摘要。

根据会议内容自然组织，可以包含讨论要点、达成共识、行动项等，不要拘泥于固定格式。
如果内容简短或非正式，直接总结核心内容即可。
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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: formattedTranscript },
      ],
      temperature: 0.5,
      max_tokens: 2000,
    });

    const summary = completion.choices[0]?.message?.content?.trim() || "";

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Summarization error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Summarization failed" },
      { status: 500 }
    );
  }
}
