import { Redis } from "@upstash/redis";
import { isAuthorizedEmail, type MonthlyUsage } from "@/lib/edge-config";

// Usage counters live in Redis (atomic HINCRBY), not in Edge Config.
// Key layout: usage:{email}:{YYYY-MM} → hash { stt_seconds, llm_input_tokens, llm_output_tokens }

const USAGE_FIELDS = ["stt_seconds", "llm_input_tokens", "llm_output_tokens"] as const;

let _redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (_redis === undefined) {
    // Vercel Marketplace (Upstash) injects KV_REST_API_*; a direct Upstash setup uses UPSTASH_REDIS_REST_*
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    _redis = url && token ? new Redis({ url, token }) : null;
    if (!_redis) console.warn("Usage tracking disabled: Redis env vars are not set");
  }
  return _redis;
}

// UTC month so all serverless regions agree on the bucket
export function getMonthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function usageKey(email: string, month: string): string {
  return `usage:${email.toLowerCase()}:${month}`;
}

export async function incrementUsage(
  email: string,
  delta: Partial<MonthlyUsage>
): Promise<void> {
  const redis = getRedis();
  if (!redis || !email) return;

  const increments = USAGE_FIELDS.filter((f) => (delta[f] ?? 0) > 0);
  if (increments.length === 0) return;

  // Only count whitelisted users (skips e.g. the "admin" pseudo-user)
  if (!(await isAuthorizedEmail(email))) return;

  const key = usageKey(email, getMonthKey());
  const pipe = redis.pipeline();
  for (const f of increments) pipe.hincrby(key, f, Math.round(delta[f]!));
  await pipe.exec();
}

// Returns usage for the last `months` months (including the current one) per email.
// Months with no recorded usage are omitted.
export async function getUsageForUsers(
  emails: string[],
  months = 12
): Promise<Record<string, Record<string, MonthlyUsage>>> {
  const result: Record<string, Record<string, MonthlyUsage>> = {};
  const redis = getRedis();
  if (!redis || emails.length === 0) return result;

  const now = new Date();
  const monthKeys = Array.from({ length: months }, (_, i) =>
    getMonthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)))
  );

  const pipe = redis.pipeline();
  const lookups: [string, string][] = [];
  for (const email of emails) {
    for (const month of monthKeys) {
      pipe.hgetall<Record<string, number>>(usageKey(email, month));
      lookups.push([email.toLowerCase(), month]);
    }
  }
  const rows = await pipe.exec<(Record<string, number> | null)[]>();

  rows.forEach((row, i) => {
    if (!row) return;
    const [email, month] = lookups[i];
    (result[email] ??= {})[month] = {
      stt_seconds: Number(row.stt_seconds ?? 0),
      llm_input_tokens: Number(row.llm_input_tokens ?? 0),
      llm_output_tokens: Number(row.llm_output_tokens ?? 0),
    };
  });
  return result;
}
