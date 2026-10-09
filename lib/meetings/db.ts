// Postgres (Neon via the Vercel integration, or any Postgres — a local
// server in development and tests): saved meetings and usage. Server only.
//
// Tables are created on first use (CREATE ... IF NOT EXISTS), once per
// instance; there are no other migrations yet.

import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";

// Meetings (text and recordings) are deleted this long after they start
export const RETENTION_DAYS = 365;

// The Vercel Neon integration sets DATABASE_URL (pooled) and POSTGRES_URL
function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

export function meetingsAvailable(): boolean {
  return !!databaseUrl();
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    const url = databaseUrl();
    if (!url) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
    // Fluid compute: close idle connections before the instance suspends
    attachDatabasePool(pool);
  }
  return pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meetings (
  id text PRIMARY KEY,
  owner_email text NOT NULL,
  title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  entry_count integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}',
  speakers jsonb NOT NULL DEFAULT '[]',
  summary text
);
CREATE INDEX IF NOT EXISTS meetings_owner ON meetings (owner_email, created_at DESC);
CREATE INDEX IF NOT EXISTS meetings_expires ON meetings (expires_at);
CREATE TABLE IF NOT EXISTS meeting_entries (
  meeting_id text NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  id text NOT NULL,
  start_ms integer NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (meeting_id, id)
);
CREATE TABLE IF NOT EXISTS meeting_recordings (
  meeting_id text NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  idx integer NOT NULL,
  pathname text NOT NULL,
  url text NOT NULL DEFAULT '',
  content_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  offset_ms integer NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, idx)
);
CREATE TABLE IF NOT EXISTS meeting_shares (
  meeting_id text NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, email)
);
CREATE INDEX IF NOT EXISTS meeting_shares_email ON meeting_shares (email);
CREATE TABLE IF NOT EXISTS usage_monthly (
  email text NOT NULL,
  month text NOT NULL,
  kind text NOT NULL,
  model text NOT NULL DEFAULT '',
  calls integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cost_usd numeric(14, 6) NOT NULL DEFAULT 0,
  seconds bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (email, month, kind, model)
);
CREATE TABLE IF NOT EXISTS soniox_usage (
  uuid text PRIMARY KEY,
  client_ref text,
  model text NOT NULL DEFAULT '',
  end_time timestamptz NOT NULL,
  audio_ms bigint NOT NULL DEFAULT 0,
  cost_usd numeric(14, 6) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS soniox_usage_end ON soniox_usage (end_time);
CREATE TABLE IF NOT EXISTS user_term_packs (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  languages jsonb NOT NULL DEFAULT '[]',
  terms jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_term_packs_email ON user_term_packs (email, created_at);
CREATE TABLE IF NOT EXISTS feedback (
  id text PRIMARY KEY,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  topic text NOT NULL,
  message text NOT NULL,
  context jsonb
);
CREATE INDEX IF NOT EXISTS feedback_created ON feedback (created_at DESC);
CREATE TABLE IF NOT EXISTS sync_state (
  key text PRIMARY KEY,
  synced_to timestamptz NOT NULL
);
`;

async function ready(): Promise<Pool> {
  const p = getPool();
  schemaReady ??= p.query(SCHEMA).then(
    () => undefined,
    (e) => {
      schemaReady = null; // retry on the next request
      throw e;
    }
  );
  await schemaReady;
  return p;
}

export async function query<T extends object = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const p = await ready();
  const r = await p.query(text, params);
  return r.rows as T[];
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const p = await ready();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
