import OpenAI from "openai";

let _client: OpenAI | null = null;

// OpenRouter speaks the OpenAI chat-completions API; used for Qwen models
export function getOpenRouter(): OpenAI {
  if (!_client) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("Missing OPENROUTER_API_KEY environment variable");
    }
    _client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      // One retry at most (see lib/openai.ts)
      maxRetries: 1,
      defaultHeaders: {
        "HTTP-Referer": "https://realtime-transcription-murex.vercel.app",
        "X-Title": "ABL-translate",
      },
    });
  }
  return _client;
}
