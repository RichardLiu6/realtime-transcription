/**
 * Translation model comparison test (OpenAI + Anthropic)
 * Usage: node scripts/test-translate-models.mjs [model1,model2,...]
 *
 * Examples:
 *   node scripts/test-translate-models.mjs                              # run all models
 *   node scripts/test-translate-models.mjs gpt-5.2,gpt-5-mini          # run specific OpenAI models
 *   node scripts/test-translate-models.mjs claude-haiku-4-5-20251001    # run specific Claude model
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
config({ path: ".env.local" });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Provider detection ───────────────────────────────────────
const CLAUDE_MODELS = new Set([
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-6",
  "claude-opus-4-5-20250514",
]);

function isClaude(model) {
  return CLAUDE_MODELS.has(model) || model.startsWith("claude-");
}

// ── All models to test ───────────────────────────────────────
const ALL_MODELS = [
  "gpt-5.2",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-4o-mini",
  "gpt-4o",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-6",
];

// ── Test sentences ──────────────────────────────────────────
const TEST_CASES = [
  {
    name: "Casual meeting talk (ZH→EN)",
    sourceLang: "Chinese",
    targetLang: "English",
    context: ["我这是天下会议。", "我也不知道应该叫什么。"],
    text: "哎呀，反正两个人也可以说。好好好，我也觉得可以。接下来我该看什么。",
  },
  {
    name: "Technical discussion (ZH→EN)",
    sourceLang: "Chinese",
    targetLang: "English",
    context: ["我们的API延迟太高了。", "用户反馈说经常超时。"],
    text: "我觉得可以加一层缓存，然后把WebSocket的重连逻辑优化一下，应该能解决大部分问题。",
  },
  {
    name: "English to Chinese (EN→ZH)",
    sourceLang: "English",
    targetLang: "Chinese",
    context: ["Let's discuss the Q1 report.", "Revenue is up 15%."],
    text: "I think we should focus on customer retention this quarter. The churn rate has been creeping up.",
  },
];

// ── OpenAI model quirks ──────────────────────────────────────
const NO_TEMPERATURE_MODELS = ["gpt-5-mini", "gpt-5-nano"];
const NEW_API_MODELS = ["gpt-5-mini", "gpt-5-nano", "gpt-5.2"];
const REASONING_MODELS = ["gpt-5-mini", "gpt-5-nano"]; // supports reasoning_effort

function buildMessages(testCase) {
  const systemPrompt = `You are a real-time meeting translator. Translate spoken ${testCase.sourceLang} to ${testCase.targetLang}.

Rules:
- Output ONLY the translation, nothing else
- Keep the conversational/spoken tone — do not formalize
- Preserve the speaker's intent, including hedging, filler, and emphasis
- Keep proper nouns, brand names, and technical terms as-is unless a translation is standard`;

  const messages = [{ role: "system", content: systemPrompt }];

  if (testCase.context.length > 0) {
    messages.push({
      role: "user",
      content: `[Context — previous sentences for reference, do NOT translate these]\n${testCase.context.join("\n")}`,
    });
    messages.push({
      role: "assistant",
      content: "(understood, I will use this context for coherent translation)",
    });
  }

  messages.push({ role: "user", content: testCase.text });
  return { systemPrompt, messages };
}

// ── OpenAI test ──────────────────────────────────────────────
async function testOpenAI(model, testCase) {
  const { messages } = buildMessages(testCase);
  const params = { model, messages };

  if (!NO_TEMPERATURE_MODELS.includes(model)) {
    params.temperature = 0.3;
  }

  if (NEW_API_MODELS.includes(model)) {
    params.max_completion_tokens = 1000;
  } else {
    params.max_tokens = 1000;
  }

  if (REASONING_MODELS.includes(model)) {
    params.reasoning_effort = "minimal";
  }

  const start = Date.now();
  try {
    const r = await openai.chat.completions.create(params);
    const ms = Date.now() - start;
    const usage = r.usage;
    return {
      model,
      ms,
      translation: r.choices[0].message.content.trim(),
      tokensIn: usage?.prompt_tokens,
      tokensOut: usage?.completion_tokens,
      error: null,
    };
  } catch (e) {
    return { model, ms: Date.now() - start, translation: null, tokensIn: 0, tokensOut: 0, error: e.message };
  }
}

// ── Anthropic test ───────────────────────────────────────────
async function testAnthropic(model, testCase) {
  const { systemPrompt, messages } = buildMessages(testCase);

  // Anthropic uses separate system param + messages (no "system" role in messages array)
  const anthropicMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const start = Date.now();
  try {
    const r = await anthropic.messages.create({
      model,
      max_tokens: 1000,
      temperature: 0.3,
      system: systemPrompt,
      messages: anthropicMessages,
    });
    const ms = Date.now() - start;
    return {
      model,
      ms,
      translation: r.content[0].text.trim(),
      tokensIn: r.usage?.input_tokens,
      tokensOut: r.usage?.output_tokens,
      error: null,
    };
  } catch (e) {
    return { model, ms: Date.now() - start, translation: null, tokensIn: 0, tokensOut: 0, error: e.message };
  }
}

// ── Router ───────────────────────────────────────────────────
async function testModel(model, testCase) {
  if (isClaude(model)) {
    return testAnthropic(model, testCase);
  }
  return testOpenAI(model, testCase);
}

async function main() {
  // Parse model list from CLI args
  const argModels = process.argv[2]?.split(",").map((m) => m.trim()).filter(Boolean);
  const models = argModels && argModels.length > 0 ? argModels : ALL_MODELS;

  // Check API keys
  const needsOpenAI = models.some((m) => !isClaude(m));
  const needsClaude = models.some((m) => isClaude(m));

  if (needsOpenAI && !process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY not set in .env.local");
    process.exit(1);
  }
  if (needsClaude && !process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY not set in .env.local");
    process.exit(1);
  }

  console.log(`\nTesting ${models.length} models: ${models.join(", ")}\n`);
  console.log("=".repeat(80));

  for (const testCase of TEST_CASES) {
    console.log(`\n📝 ${testCase.name}`);
    console.log(`   Source: "${testCase.text}"`);
    console.log("-".repeat(80));

    const results = await Promise.all(models.map((m) => testModel(m, testCase)));

    // Sort by latency
    results.sort((a, b) => a.ms - b.ms);

    for (const r of results) {
      if (r.error) {
        console.log(`   ❌ ${r.model.padEnd(30)} | ERROR: ${r.error}`);
      } else {
        console.log(`   ✅ ${r.model.padEnd(30)} | ${r.ms}ms | in=${r.tokensIn} out=${r.tokensOut}`);
        console.log(`      → ${r.translation}`);
      }
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("Done.\n");
}

main();
