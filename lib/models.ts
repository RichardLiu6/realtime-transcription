// Translation model pool. Every model costs at most $0.5 per million tokens,
// input and output (list prices per million, input / output, Sep 2026).
//
// "vendor/model" IDs go through OpenRouter (one key, one balance for every
// vendor); "qwen-mt-*" go to Alibaba Cloud Model Studio (DashScope) directly.
// No dependencies: imported by client pages (admin, compare) too.

export interface PoolModel {
  id: string;
  label: string;
  price: string; // $ per million tokens, input / output
}

export const MODEL_POOL = [
  { id: "qwen/qwen3.8-flash", label: "Qwen3.8 Flash", price: "0.15 / 0.47" },
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", price: "0.10 / 0.40" },
  // Open weights, served by several providers — not limited by Alibaba's quota
  { id: "qwen/qwen3-235b-a22b-2507", label: "Qwen3 235B Instruct", price: "0.087 / 0.35" },
  // Reasoning model; runs with reasoning off (effort "none") like the others
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna", price: "0.10 / 0.50" },
  { id: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano", price: "0.10 / 0.40" },
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", price: "0.049 / 0.098" },
  { id: "qwen/qwen3.7-flash", label: "Qwen3.7 Flash", price: "0.03 / 0.13" },
  { id: "bytedance-seed/seed-2.0-mini", label: "Seed 2.0 Mini（字节）", price: "0.10 / 0.40" },
  { id: "xiaomi/mimo-v2.6-flash", label: "MiMo V2.6 Flash（小米）", price: "0.14 / 0.28" },
  // Dedicated translation model: own prompt templates, one call per target
  { id: "tencent/hy-mt2-30b-a3b", label: "Hy-MT2 30B（腾讯翻译模型）", price: "0.074 / 0.295" },
  { id: "qwen-mt-flash", label: "Qwen-MT Flash（阿里云百炼）", price: "0.16 / 0.49" },
  { id: "qwen-mt-lite", label: "Qwen-MT Lite（阿里云百炼）", price: "0.12 / 0.36" },
] as const satisfies readonly PoolModel[];

export type TranslationModel = (typeof MODEL_POOL)[number]["id"];

export const SUPPORTED_MODELS: readonly string[] = MODEL_POOL.map((m) => m.id);

export const QWEN_MT_DEFAULT_MODEL: TranslationModel = "qwen-mt-flash";
export const OPENROUTER_DEFAULT_MODEL: TranslationModel = "qwen/qwen3.8-flash";

// Tried in order when a model fails (rate limit, provider down, no credits),
// skipping the failed one and unconfigured providers. Different vendors
// after the default, so one vendor's rate limit can't stop translation.
export const FALLBACK_CHAIN: readonly TranslationModel[] = [
  "qwen-mt-flash",
  "qwen-mt-lite",
  "qwen/qwen3.8-flash",
  "google/gemini-2.5-flash-lite",
  "qwen/qwen3-235b-a22b-2507",
  "openai/gpt-6-luna",
];

export function modelLabel(id: string): string {
  return MODEL_POOL.find((m) => m.id === id)?.label ?? id;
}

export function isSupportedModel(id: unknown): id is TranslationModel {
  return typeof id === "string" && SUPPORTED_MODELS.includes(id);
}
