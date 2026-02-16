import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Convert PCM16 base64 to WAV buffer
function pcm16ToWav(base64Pcm: string, sampleRate: number): Buffer {
  const pcmBuffer = Buffer.from(base64Pcm, "base64");
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const headerSize = 44;

  const wav = Buffer.alloc(headerSize + dataSize);
  // RIFF header
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);
  // fmt chunk
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(numChannels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  // data chunk
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(wav, headerSize);

  return wav;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { audio, model } = body;
    // audio: base64-encoded PCM16 24kHz mono
    // model: "whisper-large-v3" or "whisper-large-v3-turbo"

    if (!audio || !model) {
      return NextResponse.json(
        { error: "Missing audio or model" },
        { status: 400 }
      );
    }

    const wavBuffer = pcm16ToWav(audio, 24000);

    // Create a File object from the WAV buffer (use Uint8Array for type compatibility)
    const file = new File([new Uint8Array(wavBuffer)], "audio.wav", { type: "audio/wav" });

    const transcription = await groq.audio.transcriptions.create({
      file,
      model,
      temperature: 0,
      response_format: "text",
    });

    return NextResponse.json({
      text: typeof transcription === "string" ? transcription : transcription.text,
    });
  } catch (error) {
    console.error("Groq transcribe error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Groq transcription failed",
      },
      { status: 500 }
    );
  }
}
