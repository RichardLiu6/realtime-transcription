// Live caption sharing: storage for shared rooms (server only).
//
// Vercel runs the API on many short-lived instances that share no memory:
// the host's publish and a viewer's poll can land on different ones, and an
// idle instance is recycled with whatever it held. So rooms live in Redis
// (Upstash, over its REST API — no client library needed). Without Redis
// configured, a local server (dev / tests: one process) keeps rooms in
// memory; on Vercel sharing is then unavailable rather than silently lossy.
//
// Per room, two keys (both expire ROOM_TTL after the last heartbeat):
//   live:<room>:state  hash  entry id → entry JSON, plus "_info" → info JSON
//                            (the latest state: what a new viewer loads)
//   live:<room>:log    list  one JSON batch per publish (what a viewer
//                            already watching reads since its version)
// A room's version is the length of its log; a publish writes both keys in
// one transaction, so a snapshot and its version always agree.

export const ROOM_TTL_SECONDS = 24 * 60 * 60;
// A viewer far behind catches up over several polls
export const MAX_BATCHES_PER_READ = 300;

export interface LiveBatch {
  at: number; // server time (ms)
  entries?: unknown[];
  info?: unknown;
  reset?: boolean; // the host started a new meeting: drop earlier entries
}

export type LiveRead =
  | { kind: "missing" }
  | { kind: "snapshot"; version: number; entries: unknown[]; info: unknown }
  | { kind: "batches"; version: number; batches: LiveBatch[] };

interface LiveStore {
  publish(room: string, batch: LiveBatch, touch: boolean): Promise<number>;
  read(room: string, since: number): Promise<LiveRead>;
  remove(room: string): Promise<void>;
}

const INFO_FIELD = "_info";
const stateKey = (room: string) => `live:${room}:state`;
const logKey = (room: string) => `live:${room}:log`;

function entryId(entry: unknown): string | null {
  const id = (entry as { id?: unknown })?.id;
  return typeof id === "string" && id !== INFO_FIELD ? id : null;
}

// --- Upstash Redis (REST) ---

// Vercel's Upstash integration sets KV_REST_API_*; a database created on
// upstash.com directly gives UPSTASH_REDIS_REST_*
function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

// Commands in one MULTI/EXEC transaction; returns each command's result
async function transaction(commands: (string | number)[][]): Promise<unknown[]> {
  const config = redisConfig()!;
  const res = await fetch(`${config.url}/multi-exec`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  const body = (await res.json()) as { result?: unknown; error?: string }[] | { error?: string };
  if (!res.ok || !Array.isArray(body)) {
    throw new Error(`Redis: ${(body as { error?: string })?.error ?? res.status}`);
  }
  return body.map((r) => {
    if (r.error) throw new Error(`Redis: ${r.error}`);
    return r.result;
  });
}

const redisStore: LiveStore = {
  async publish(room, batch, touch) {
    const commands: (string | number)[][] = [];
    if (batch.reset) commands.push(["DEL", stateKey(room)]);
    const fields: string[] = [];
    for (const entry of batch.entries ?? []) {
      const id = entryId(entry);
      if (id) fields.push(id, JSON.stringify(entry));
    }
    if (batch.info !== undefined) fields.push(INFO_FIELD, JSON.stringify(batch.info));
    if (fields.length > 0) commands.push(["HSET", stateKey(room), ...fields]);
    const logIndex = commands.push(["RPUSH", logKey(room), JSON.stringify(batch)]) - 1;
    // Expiry is refreshed by the host's heartbeat, not on every publish
    if (touch) {
      commands.push(["EXPIRE", stateKey(room), ROOM_TTL_SECONDS]);
      commands.push(["EXPIRE", logKey(room), ROOM_TTL_SECONDS]);
    }
    const results = await transaction(commands);
    return Number(results[logIndex]);
  },

  async read(room, since) {
    if (since <= 0) {
      const [hash, length] = await transaction([
        ["HGETALL", stateKey(room)],
        ["LLEN", logKey(room)],
      ]);
      const flat = (hash as string[] | null) ?? [];
      if (Number(length) === 0 && flat.length === 0) return { kind: "missing" };
      let info: unknown = null;
      const entries: unknown[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2) {
        const value = JSON.parse(flat[i + 1]);
        if (flat[i] === INFO_FIELD) info = value;
        else entries.push(value);
      }
      return { kind: "snapshot", version: Number(length), entries, info };
    }
    const [items, length] = await transaction([
      ["LRANGE", logKey(room), since, since + MAX_BATCHES_PER_READ - 1],
      ["LLEN", logKey(room)],
    ]);
    if (Number(length) === 0) return { kind: "missing" };
    const batches = ((items as string[] | null) ?? []).map((s) => JSON.parse(s) as LiveBatch);
    return { kind: "batches", version: since + batches.length, batches };
  },

  async remove(room) {
    await transaction([["DEL", stateKey(room), logKey(room)]]);
  },
};

// --- In memory (a single local server process) ---

interface MemoryRoom {
  entries: Map<string, unknown>;
  info: unknown;
  log: LiveBatch[];
  expiresAt: number;
}

// On globalThis so every route module of the process sees the same rooms
const memoryRooms: Map<string, MemoryRoom> = ((globalThis as { __liveRooms?: Map<string, MemoryRoom> }).__liveRooms ??=
  new Map());

function memoryRoom(room: string): MemoryRoom | undefined {
  const r = memoryRooms.get(room);
  if (r && r.expiresAt < Date.now()) {
    memoryRooms.delete(room);
    return undefined;
  }
  return r;
}

const memoryStore: LiveStore = {
  async publish(room, batch, touch) {
    let r = memoryRoom(room);
    if (!r) {
      r = { entries: new Map(), info: null, log: [], expiresAt: Date.now() + ROOM_TTL_SECONDS * 1000 };
      memoryRooms.set(room, r);
    }
    if (batch.reset) r.entries.clear();
    for (const entry of batch.entries ?? []) {
      const id = entryId(entry);
      if (id) r.entries.set(id, entry);
    }
    if (batch.info !== undefined) r.info = batch.info;
    r.log.push(batch);
    if (touch) r.expiresAt = Date.now() + ROOM_TTL_SECONDS * 1000;
    return r.log.length;
  },

  async read(room, since) {
    const r = memoryRoom(room);
    if (!r) return { kind: "missing" };
    if (since <= 0) {
      return { kind: "snapshot", version: r.log.length, entries: Array.from(r.entries.values()), info: r.info };
    }
    const batches = r.log.slice(since, since + MAX_BATCHES_PER_READ);
    return { kind: "batches", version: since + batches.length, batches };
  },

  async remove(room) {
    memoryRooms.delete(room);
  },
};

// Sharing works with Redis, or on a local server; not on Vercel without it
export function liveSharingAvailable(): boolean {
  return !!redisConfig() || process.env.VERCEL !== "1";
}

export function liveStore(): LiveStore {
  return redisConfig() ? redisStore : memoryStore;
}
