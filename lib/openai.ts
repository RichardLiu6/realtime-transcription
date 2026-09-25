import OpenAI from "openai";

let _client: OpenAI | null = null;

// Lazy so `next build` doesn't require OPENAI_API_KEY at module load
export function getOpenAI(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY environment variable");
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}
