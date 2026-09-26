// Translation model pool. Every model costs at most $0.5 per million tokens,
// input and output (list prices per million, input / output, Sep 2026).
//
// All models go through OpenRouter ("vendor/model" IDs: one key, one
// balance for every vendor).
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
] as const satisfies readonly PoolModel[];

export type TranslationModel = (typeof MODEL_POOL)[number]["id"];

export const SUPPORTED_MODELS: readonly string[] = MODEL_POOL.map((m) => m.id);

// Seed 2.0 Mini: fastest and steadiest in the /api/eval run (median 0.75 s,
// max 1.0 s over 20 calls), keeps unfinished sentences unfinished, not
// served from Alibaba's shared, rate-limited pool
export const OPENROUTER_DEFAULT_MODEL: TranslationModel = "bytedance-seed/seed-2.0-mini";

// Tried in order when a model fails (rate limit, provider down, no credits),
// skipping the failed one and unconfigured providers. No Qwen: Alibaba
// serves Qwen3.x from a shared, often rate-limited pool, and the team
// prefers other models' output; Qwen stays selectable in admin.
export const FALLBACK_CHAIN: readonly TranslationModel[] = [
  "bytedance-seed/seed-2.0-mini",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-6-luna",
  "openai/gpt-4.1-nano",
];

export function modelLabel(id: string): string {
  return MODEL_POOL.find((m) => m.id === id)?.label ?? id;
}

export function isSupportedModel(id: unknown): id is TranslationModel {
  return typeof id === "string" && SUPPORTED_MODELS.includes(id);
}
