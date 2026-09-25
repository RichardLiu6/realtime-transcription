// Translation model evaluation — PREVIEW DEPLOYMENTS ONLY.
//
// GET /api/eval[?models=a,b][&rounds=2][&cases=a,b] runs a fixed set of meeting
// sentences (zh / en / es, code-switching, unfinished speech, terms,
// multilingual columns) through each model via the real /api/translate
// handler, and returns every translation with its latency.
//
// Access: 404 outside VERCEL_ENV=preview. Preview URLs sit behind Vercel
// Authentication (team members only), so the app login is skipped here;
// the handler is called in-process with a short-lived admin token.

import { NextRequest, NextResponse } from "next/server";
import { POST as translate } from "@/app/api/translate/route";
import { signToken } from "@/lib/auth";
import { isSupportedModel } from "@/lib/models";

export const maxDuration = 300;

const DEFAULT_MODELS = [
  "qwen/qwen3.8-flash",
  "qwen/qwen3.7-flash",
  "bytedance-seed/seed-2.0-mini",
  "xiaomi/mimo-v2.6-flash",
  "tencent/hy-mt2-30b-a3b",
  "qwen-mt-flash",
  "qwen-mt-lite",
];

interface Case {
  id: string;
  note: string;
  body: Record<string, unknown>;
}

const TERMS = ["千问=Qwen", "硬胶囊=hard capsule", "批记录=batch record"];

const CASES: Case[] = [
  { id: "zh-en", note: "filler words, domain term", body: { text: "呃，我们现在要对这个硬胶囊的这个配方进行一个调整，然后想看一下这个里面都有什么内容。", sourceLang: "zh", targetLang: "en", terms: TERMS } },
  { id: "zh-en-unfinished", note: "sentence cut off: must not be completed", body: { text: "你看，我现在是在测不同模型的这个实时的这个翻译的能力，然后它会出现这个延迟的这个", sourceLang: "zh", targetLang: "en" } },
  { id: "zh-en-term", note: "term pair 千问=Qwen", body: { text: "嗯，然后为什么这个千问的3.8 Flash不显示这个翻译的细节呢？", sourceLang: "zh", targetLang: "en", terms: TERMS } },
  { id: "en-zh", note: "business English", body: { text: "So the FDA audit is next Tuesday, we need all the batch records ready by Friday at the latest.", sourceLang: "en", targetLang: "zh", terms: TERMS } },
  { id: "es-zh", note: "Spanish to Chinese", body: { text: "El cliente quiere reducir el costo por unidad en un diez por ciento antes de firmar el contrato.", sourceLang: "es", targetLang: "zh" } },
  { id: "mix-zh-en", note: "Chinese with English words", body: { text: "这个 batch 的 yield 太低了，我们要 check 一下 process 哪里有问题。", sourceLang: "zh", targetLang: "en" } },
  {
    id: "multi-mix-zh-en",
    note: "multilingual columns zh/en/es; zh column must be all Chinese",
    body: { text: "这个 batch 的 yield 太低了，我们要 check 一下 process 哪里有问题。", sourceLang: "zh", targetLangs: ["zh", "en", "es"] },
  },
  {
    id: "multi-mix-zh-es",
    note: "multilingual, Chinese with Spanish words",
    body: { text: "我们下个月要去 México 见 el proveedor，谈一下 el precio。", sourceLang: "zh", targetLangs: ["zh", "en", "es"] },
  },
  {
    id: "multi-en",
    note: "multilingual, English speaker; en column = clean English",
    body: { text: "Um, I think we should, uh, push the launch to next month, because the packaging isn't ready.", sourceLang: "en", targetLangs: ["zh", "en", "es"] },
  },
  {
    id: "clause",
    note: "clause mode continuation: output only the new part",
    body: {
      text: "所以我们下周推迟发布。",
      sourceLang: "zh",
      targetLang: "en",
      continuation: { sourceSoFar: "因为预算不够，", translationSoFar: "Because the budget isn't enough," },
    },
  },
];

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const params = req.nextUrl.searchParams;
  const models = (params.get("models")?.split(",") ?? DEFAULT_MODELS).filter(isSupportedModel);
  const rounds = Math.min(Math.max(Number(params.get("rounds")) || 1, 1), 3);
  const only = params.get("cases")?.split(",");
  const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;

  // Admin token (explicit model honoured, never substituted); no email, so
  // nothing is written to usage tracking
  const adminToken = await signToken({ isAdmin: true }, "10m");

  const call = async (model: string, c: Case) => {
    const start = Date.now();
    const request = new NextRequest(new URL("/api/translate", req.url), {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `admin_token=${adminToken}` },
      body: JSON.stringify({ ...c.body, model }),
    });
    const res = await translate(request);
    const json = await res.json();
    return {
      ms: Date.now() - start,
      status: res.status,
      ...(json.translations ? { translations: json.translations } : {}),
      ...(json.translatedText !== undefined ? { text: json.translatedText } : {}),
      ...(json.error ? { error: json.error } : {}),
    };
  };

  const results = [];
  for (const c of cases) {
    const byModel: Record<string, unknown[]> = {};
    for (let r = 0; r < rounds; r++) {
      // Models in parallel, like the compare page
      const outs = await Promise.all(models.map((m) => call(m, c).catch((e) => ({ error: String(e) }))));
      models.forEach((m, i) => (byModel[m] ??= []).push(outs[i]));
    }
    results.push({ id: c.id, note: c.note, source: c.body.text, byModel });
    // One line per case × model in the runtime logs (fixed test sentences,
    // no meeting content), so results can be read without the response
    for (const [m, outs] of Object.entries(byModel)) {
      console.log(`[eval] case=${c.id} model=${m} ${JSON.stringify(outs)}`);
    }
  }
  return NextResponse.json({ models, rounds, results });
}
