import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY environment variable");
    }
    // One retry at most (see lib/openai.ts)
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 });
  }
  return _client;
}
