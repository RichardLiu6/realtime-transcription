// Soniox transcription cost as Soniox bills it. Server only.
//
// Every temporary key /api/soniox-token issues carries the user's email as
// its client_reference_id (bound to the key, the browser can't change it),
// and Soniox records it with each request in its usage logs
// (GET /v1/usage-logs: per request, audio duration and exact cost). Those
// logs only reach 91 days back, so they are copied into Postgres
// (`soniox_usage`, one row per request): daily by Vercel Cron, and when an
// admin opens the usage table if the last copy is older than a few minutes.

import { query } from "@/lib/meetings/db";

const BASE_URL = () => process.env.SONIOX_API_BASE_URL || "https://api.soniox.com";
const DAY_MS = 24 * 60 * 60 * 1000;
// Soniox limits: start_time at most 91 days ago, windows of at most 31 days
const MAX_LOOKBACK_MS = 90 * DAY_MS;
const MAX_WINDOW_MS = 30 * DAY_MS;
// Logs can appear a while after a request ends: re-read the last two days
// (rows are keyed by request uuid, so nothing counts twice)
const OVERLAP_MS = 2 * DAY_MS;
const PAGE_SIZE = 1000;
const STATE_KEY = "soniox_usage";

export function sonioxUsageAvailable(): boolean {
  return !!process.env.SONIOX_API_KEY;
}

// The client_reference_id for a user (Soniox allows 256 characters)
export function sonioxClientRef(email: string): string {
  return email.toLowerCase().slice(0, 256);
}

interface UsageLog {
  uuid: string;
  client_reference_id?: string | null;
  model?: string;
  end_time: string;
  input_audio_duration_ms?: number;
  cost_usd?: string;
}

async function fetchLogs(start: Date, end: Date, signal?: AbortSignal): Promise<UsageLog[]> {
  const logs: UsageLog[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      limit: String(PAGE_SIZE),
    });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${BASE_URL()}/v1/usage-logs?${params}`, {
      headers: { Authorization: `Bearer ${process.env.SONIOX_API_KEY}` },
      signal,
    });
    if (!res.ok) throw new Error(`Soniox usage logs ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const data = (await res.json()) as { usage_logs?: UsageLog[]; next_page_cursor?: string | null };
    logs.push(...(data.usage_logs ?? []));
    cursor = data.next_page_cursor ?? null;
  } while (cursor);
  return logs;
}

async function store(logs: UsageLog[]): Promise<void> {
  for (let i = 0; i < logs.length; i += PAGE_SIZE) {
    const chunk = logs.slice(i, i + PAGE_SIZE);
    const values: unknown[] = [];
    const rows = chunk.map((l, j) => {
      values.push(
        l.uuid,
        l.client_reference_id ? sonioxClientRef(l.client_reference_id) : null,
        l.model ?? "",
        l.end_time,
        Math.round(Number(l.input_audio_duration_ms) || 0),
        Number(l.cost_usd) || 0
      );
      const p = j * 6;
      return `($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6})`;
    });
    await query(
      `INSERT INTO soniox_usage (uuid, client_ref, model, end_time, audio_ms, cost_usd)
       VALUES ${rows.join(", ")}
       ON CONFLICT (uuid) DO UPDATE SET cost_usd = EXCLUDED.cost_usd, audio_ms = EXCLUDED.audio_ms`,
      values
    );
  }
}

async function syncedTo(): Promise<Date | null> {
  const rows = await query<{ synced_to: Date }>(`SELECT synced_to FROM sync_state WHERE key = $1`, [STATE_KEY]);
  return rows[0]?.synced_to ?? null;
}

// Copy new usage logs; with maxAgeMs, only when the last copy is older.
// Returns when the data was last brought up to date.
export async function syncSonioxUsage(maxAgeMs = 0, signal?: AbortSignal): Promise<Date> {
  const now = new Date();
  const last = await syncedTo();
  if (last && now.getTime() - last.getTime() < maxAgeMs) return last;
  let start = new Date(
    Math.max(now.getTime() - MAX_LOOKBACK_MS, last ? last.getTime() - OVERLAP_MS : 0)
  );
  while (start < now) {
    const end = new Date(Math.min(start.getTime() + MAX_WINDOW_MS, now.getTime()));
    const logs = await fetchLogs(start, end, signal);
    if (logs.length > 0) await store(logs);
    start = end;
  }
  await query(
    `INSERT INTO sync_state (key, synced_to) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET synced_to = EXCLUDED.synced_to`,
    [STATE_KEY, now]
  );
  return now;
}

export interface SonioxMonth {
  // Per user (client_ref = email); "" = requests without one (before
  // attribution started, or the Soniox playground)
  byRef: Map<string, { costUsd: number; audioMs: number; requests: number }>;
  totalUsd: number;
  // Attribution covers this month (it has requests with a user)
  attributed: boolean;
}

export async function sonioxUsageForMonth(month: string): Promise<SonioxMonth> {
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const rows = await query<{ ref: string; cost: string; audio_ms: string; requests: string }>(
    `SELECT COALESCE(client_ref, '') AS ref, SUM(cost_usd) AS cost, SUM(audio_ms) AS audio_ms, COUNT(*) AS requests
     FROM soniox_usage WHERE end_time >= $1 AND end_time < $2 GROUP BY 1`,
    [start, end]
  );
  const byRef = new Map<string, { costUsd: number; audioMs: number; requests: number }>();
  let totalUsd = 0;
  for (const r of rows) {
    const costUsd = Number(r.cost);
    byRef.set(r.ref, { costUsd, audioMs: Number(r.audio_ms), requests: Number(r.requests) });
    totalUsd += costUsd;
  }
  return { byRef, totalUsd, attributed: rows.some((r) => r.ref !== "") };
}

export async function sonioxMonths(): Promise<string[]> {
  const rows = await query<{ month: string }>(
    `SELECT DISTINCT to_char(end_time AT TIME ZONE 'UTC', 'YYYY-MM') AS month FROM soniox_usage`
  );
  return rows.map((r) => r.month);
}
