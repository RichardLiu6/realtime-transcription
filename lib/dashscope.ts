import OpenAI from "openai";

let _client: OpenAI | null = null;

// Alibaba Cloud Model Studio (DashScope), OpenAI-compatible mode — hosts
// the Qwen-MT translation models, which OpenRouter doesn't carry.
// International (Singapore) endpoint by default; set DASHSCOPE_BASE_URL to
// https://dashscope.aliyuncs.com/compatible-mode/v1 for a mainland-China key.
export function getDashScope(): OpenAI {
  if (!_client) {
    if (!process.env.DASHSCOPE_API_KEY) {
      throw new Error("Missing DASHSCOPE_API_KEY environment variable");
    }
    _client = new OpenAI({
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseURL: process.env.DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      // No SDK retries: a rate-limited or failing model is retried on the
      // next model of the fallback chain (app/api/translate/route.ts), which
      // is faster than waiting out the SDK's backoff on the same model
      maxRetries: 0,
      // A hung request must not stall the transcript
      timeout: 15_000,
    });
  }
  return _client;
}
