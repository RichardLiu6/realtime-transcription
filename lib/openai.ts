import OpenAI from "openai";

let _client: OpenAI | null = null;

// Lazy so `next build` doesn't require OPENAI_API_KEY at module load
export function getOpenAI(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY environment variable");
    }
    // One retry at most: live translation can't wait out the SDK's default
    // backoff (2 retries), and an exhausted balance never recovers by retrying
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1 });
  }
  return _client;
}
