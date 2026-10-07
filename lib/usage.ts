// Usage and cost per user and month (Postgres `usage_monthly`), shown to
// admins only. Server only.
//
// - translate / provisional / summary: one row per model; tokens and the
//   exact cost OpenRouter reports with every response (`usage.cost`, USD)
// - stt: seconds of Soniox audio reported by the page on stop. Shown with a
//   list-price estimate only for months without Soniox's own per-user
//   figures (lib/sonioxUsage.ts), which replace it from attribution on
//
// Rows are incremented atomically (INSERT … ON CONFLICT DO UPDATE), and
// recorded with after() so the write completes after the response is sent.

import { after, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { meetingsAvailable, query } from "@/lib/meetings/db";
import type { SonioxMonth } from "@/lib/sonioxUsage";

export type UsageKind = "translate" | "provisional" | "summary" | "terms" | "stt";

export const SONIOX_USD_PER_HOUR = 0.12;

export interface UsageDelta {
  kind: UsageKind;
  model?: string;
  calls?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  seconds?: number;
}

// Tokens and cost from an OpenAI-SDK response via OpenRouter
export function openRouterUsage(usage: unknown): { inputTokens: number; outputTokens: number; costUsd: number } {
  const u = (usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  return {
    inputTokens: Number(u.prompt_tokens) || 0,
    outputTokens: Number(u.completion_tokens) || 0,
    costUsd: Number(u.cost) || 0,
  };
}

export function monthKey(date = new Date()): string {
  return date.toISOString().slice(0, 7); // UTC "2026-10"
}

export async function recordUsage(email: string, d: UsageDelta): Promise<void> {
  if (!email || !meetingsAvailable()) return;
  await query(
    `INSERT INTO usage_monthly (email, month, kind, model, calls, input_tokens, output_tokens, cost_usd, seconds)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (email, month, kind, model) DO UPDATE SET
       calls = usage_monthly.calls + EXCLUDED.calls,
       input_tokens = usage_monthly.input_tokens + EXCLUDED.input_tokens,
       output_tokens = usage_monthly.output_tokens + EXCLUDED.output_tokens,
       cost_usd = usage_monthly.cost_usd + EXCLUDED.cost_usd,
       seconds = usage_monthly.seconds + EXCLUDED.seconds`,
    [
      email.toLowerCase(),
      monthKey(),
      d.kind,
      d.model ?? "",
      d.calls ?? 1,
      Math.round(d.inputTokens ?? 0),
      Math.round(d.outputTokens ?? 0),
      d.costUsd ?? 0,
      Math.round(d.seconds ?? 0),
    ]
  );
}

// Record for the logged-in user of this request, after the response
export function trackUsage(req: NextRequest, d: UsageDelta): void {
  const token = req.cookies.get("auth_token")?.value;
  if (!token || !meetingsAvailable()) return;
  after(async () => {
    try {
      const payload = await verifyToken(token);
      if (typeof payload?.email === "string") await recordUsage(payload.email, d);
    } catch (error) {
      console.error("[usage] record failed:", error);
    }
  });
}

export interface UserUsage {
  email: string;
  sttSeconds: number;
  translateCalls: number;
  provisionalCalls: number;
  summaryCalls: number;
  inputTokens: number;
  outputTokens: number;
  llmCostUsd: number;
  sttCostUsd: number; // Soniox's figure, or the list-price estimate
  totalUsd: number;
  models: { model: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number }[];
}

function emptyUser(email: string): UserUsage {
  return {
    email,
    sttSeconds: 0,
    translateCalls: 0,
    provisionalCalls: 0,
    summaryCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    llmCostUsd: 0,
    sttCostUsd: 0,
    totalUsd: 0,
    models: [],
  };
}

// Admin: one month, per user, most expensive first. With Soniox figures
// for the month (`soniox.attributed`), transcription minutes and cost are
// Soniox's, and requests without a user show as the email "" row.
export async function usageForMonth(
  month: string,
  soniox: SonioxMonth | null = null
): Promise<{ months: string[]; users: UserUsage[] }> {
  const [months, rows] = await Promise.all([
    query<{ month: string }>(`SELECT DISTINCT month FROM usage_monthly ORDER BY month DESC LIMIT 36`),
    query<{
      email: string;
      kind: UsageKind;
      model: string;
      calls: number;
      input_tokens: string;
      output_tokens: string;
      cost_usd: string;
      seconds: string;
    }>(`SELECT * FROM usage_monthly WHERE month = $1`, [month]),
  ]);
  const byUser = new Map<string, UserUsage>();
  for (const r of rows) {
    let u = byUser.get(r.email);
    if (!u) {
      u = emptyUser(r.email);
      byUser.set(r.email, u);
    }
    const inTok = Number(r.input_tokens);
    const outTok = Number(r.output_tokens);
    const cost = Number(r.cost_usd);
    if (r.kind === "stt") {
      u.sttSeconds += Number(r.seconds);
      continue;
    }
    if (r.kind === "translate") u.translateCalls += r.calls;
    else if (r.kind === "provisional") u.provisionalCalls += r.calls;
    else if (r.kind === "summary") u.summaryCalls += r.calls;
    u.inputTokens += inTok;
    u.outputTokens += outTok;
    u.llmCostUsd += cost;
    const m = u.models.find((x) => x.model === r.model);
    if (m) {
      m.calls += r.calls;
      m.inputTokens += inTok;
      m.outputTokens += outTok;
      m.costUsd += cost;
    } else {
      u.models.push({ model: r.model, calls: r.calls, inputTokens: inTok, outputTokens: outTok, costUsd: cost });
    }
  }
  const actual = soniox?.attributed ? soniox.byRef : null;
  if (actual) {
    for (const email of actual.keys()) if (!byUser.has(email)) byUser.set(email, emptyUser(email));
  }
  const users = Array.from(byUser.values()).map((u) => {
    const billed = actual?.get(u.email);
    const sttCostUsd = actual ? (billed?.costUsd ?? 0) : (u.sttSeconds / 3600) * SONIOX_USD_PER_HOUR;
    return {
      ...u,
      sttSeconds: actual ? Math.round((billed?.audioMs ?? 0) / 1000) : u.sttSeconds,
      sttCostUsd,
      totalUsd: u.llmCostUsd + sttCostUsd,
      models: u.models.sort((a, b) => b.costUsd - a.costUsd),
    };
  });
  users.sort((a, b) => b.totalUsd - a.totalUsd);
  return { months: months.map((m) => m.month), users };
}
