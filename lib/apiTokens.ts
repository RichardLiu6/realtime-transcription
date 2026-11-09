// Personal API tokens: read-only access to one's own (and shared) meetings
// from scripts and the CLI (`/api/v1/*`, `Authorization: Bearer abl_…`).
// The token is shown once; only its SHA-256 is stored. Revocable, expires
// after a year. Server only.

import { createHash, randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { query } from "@/lib/meetings/db";

export const TOKEN_PREFIX = "abl_";
export const MAX_TOKENS = 10;
const VALID_DAYS = 365;
const MAX_NAME = 40;

export interface ApiTokenInfo {
  id: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
}

interface Row {
  id: string;
  name: string;
  created_at: Date;
  expires_at: Date;
  last_used_at: Date | null;
}

const toInfo = (r: Row): ApiTokenInfo => ({
  id: r.id,
  name: r.name,
  createdAt: new Date(r.created_at).toISOString(),
  expiresAt: new Date(r.expires_at).toISOString(),
  lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
});

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export function cleanTokenName(value: unknown): string {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "";
  return name || "API";
}

export class TokenLimitError extends Error {}

export async function listTokens(email: string): Promise<ApiTokenInfo[]> {
  const rows = await query<Row>(
    `SELECT id, name, created_at, expires_at, last_used_at FROM api_tokens
      WHERE email = $1 AND expires_at > now() ORDER BY created_at DESC`,
    [email]
  );
  return rows.map(toInfo);
}

// A new token; the plain value is returned this once
export async function createToken(email: string, name: string): Promise<{ token: string; info: ApiTokenInfo }> {
  const active = await query<{ n: string }>(
    `SELECT count(*) AS n FROM api_tokens WHERE email = $1 AND expires_at > now()`,
    [email]
  );
  if (Number(active[0].n) >= MAX_TOKENS) throw new TokenLimitError("Token limit reached");
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const rows = await query<Row>(
    `INSERT INTO api_tokens (id, email, name, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))
     RETURNING id, name, created_at, expires_at, last_used_at`,
    [randomBytes(9).toString("base64url"), email, name, hash(token), VALID_DAYS]
  );
  return { token, info: toInfo(rows[0]) };
}

export async function revokeToken(email: string, id: string): Promise<boolean> {
  const rows = await query(`DELETE FROM api_tokens WHERE id = $1 AND email = $2 RETURNING id`, [id, email]);
  return rows.length > 0;
}

// The account behind `Authorization: Bearer abl_…`, or null
export async function tokenUser(req: NextRequest): Promise<{ email: string; tokenId: string } | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(abl_[A-Za-z0-9_-]{20,100})$/.exec(header.trim());
  if (!match) return null;
  const rows = await query<{ id: string; email: string; last_used_at: Date | null }>(
    `SELECT id, email, last_used_at FROM api_tokens WHERE token_hash = $1 AND expires_at > now()`,
    [hash(match[1])]
  );
  const row = rows[0];
  if (!row) return null;
  // Last use, at most once a minute (not a write per request)
  if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 60_000) {
    await query(`UPDATE api_tokens SET last_used_at = now() WHERE id = $1`, [row.id]).catch(() => {});
  }
  return { email: row.email, tokenId: row.id };
}
