// Per-user daily limit: a counter per key and UTC day, in Upstash Redis
// when configured (shared by every instance), else in this instance's
// memory (local dev; on Vercel a rough limit per instance).

const memory = new Map<string, { day: string; count: number }>();

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

// Counts this use; false when the user is already over `limit` today
export async function withinDailyLimit(name: string, user: string, limit: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `limit:${name}:${user}:${day}`;
  const redis = redisConfig();
  if (redis) {
    try {
      const res = await fetch(`${redis.url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${redis.token}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["INCR", key],
          ["EXPIRE", key, 2 * 86400],
        ]),
        cache: "no-store",
      });
      if (res.ok) {
        const [incr] = (await res.json()) as { result?: number }[];
        if (typeof incr?.result === "number") return incr.result <= limit;
      }
      console.error(`[rate-limit] redis ${res.status}; using memory`);
    } catch (error) {
      console.error("[rate-limit] redis failed; using memory:", error);
    }
  }
  const entry = memory.get(key);
  const count = entry?.day === day ? entry.count + 1 : 1;
  memory.set(key, { day, count });
  return count <= limit;
}
