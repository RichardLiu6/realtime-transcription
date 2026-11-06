// A user's own term packs (AI-suggested terms saved under a name): at most
// MAX_PACKS per user, stored with the saved meetings (Postgres). Server only;
// the shape (TermPack) is shared with the page.

import { randomBytes } from "crypto";
import { query, transaction } from "@/lib/meetings/db";
import { SONIOX_LANGUAGES } from "@/types/bilingual";
import type { TermPack } from "@/lib/termPackTypes";

// Not a quota (generating terms is limited per day instead): only keeps
// the list usable
export const MAX_PACKS = 50;
export const MAX_PACK_TERMS = 40;
const MAX_NAME = 40;
const MAX_ENTRY = 400;
const MAX_FORMS = 6;

export class PackLimitError extends Error {}

export function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  return name || null;
}

// Entries as the term list keeps them: "a=b(=c…)" or a single term
export function cleanTerms(value: unknown, max = MAX_PACK_TERMS): string[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const forms = raw.split("=").map((f) => f.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (forms.length === 0 || forms.length > MAX_FORMS) continue;
    if (forms.some((f) => /[,，、;；\n]/.test(f))) continue;
    const entry = forms.join("=");
    if (entry.length > MAX_ENTRY || seen.has(entry.toLowerCase())) continue;
    seen.add(entry.toLowerCase());
    out.push(entry);
    if (out.length >= max) break;
  }
  return out.length > 0 ? out : null;
}

export function cleanLanguages(value: unknown): string[] {
  const known = new Set(SONIOX_LANGUAGES.map((l) => l.code));
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((c): c is string => typeof c === "string" && known.has(c)))).slice(0, 5);
}

interface Row {
  id: string;
  name: string;
  languages: string[];
  terms: string[];
  topic: string;
  created_at: Date;
}

const toPack = (r: Row): TermPack => ({
  id: r.id,
  name: r.name,
  languages: r.languages,
  terms: r.terms,
  topic: r.topic,
  createdAt: new Date(r.created_at).toISOString(),
});

export async function listPacks(email: string): Promise<TermPack[]> {
  const rows = await query<Row>(
    `SELECT id, name, languages, terms, topic, created_at FROM user_term_packs WHERE email = $1 ORDER BY created_at`,
    [email]
  );
  return rows.map(toPack);
}

// A new pack; with `replaceId` (one of the user's packs) that one goes in the
// same transaction. Full without one: PackLimitError
export async function createPack(
  email: string,
  pack: { name: string; languages: string[]; terms: string[]; topic: string },
  replaceId?: string
): Promise<TermPack> {
  return transaction(async (client) => {
    // One user's saves in turn (two tabs saving at once can't both pass the limit)
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`term-packs:${email}`]);
    if (replaceId) await client.query(`DELETE FROM user_term_packs WHERE id = $1 AND email = $2`, [replaceId, email]);
    const { rows: count } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM user_term_packs WHERE email = $1`,
      [email]
    );
    if (Number(count[0].n) >= MAX_PACKS) throw new PackLimitError("Term pack limit reached");
    const id = randomBytes(9).toString("base64url");
    const { rows } = await client.query<Row>(
      `INSERT INTO user_term_packs (id, email, name, languages, terms, topic) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, languages, terms, topic, created_at`,
      [id, email, pack.name, JSON.stringify(pack.languages), JSON.stringify(pack.terms), pack.topic]
    );
    return toPack(rows[0]);
  });
}

// Rename and / or change the topic (only what is given)
export async function updatePack(email: string, id: string, change: { name?: string; topic?: string }): Promise<boolean> {
  const rows = await query(
    `UPDATE user_term_packs SET name = COALESCE($3, name), topic = COALESCE($4, topic)
      WHERE id = $1 AND email = $2 RETURNING id`,
    [id, email, change.name ?? null, change.topic ?? null]
  );
  return rows.length > 0;
}

export async function deletePack(email: string, id: string): Promise<boolean> {
  const rows = await query(`DELETE FROM user_term_packs WHERE id = $1 AND email = $2 RETURNING id`, [id, email]);
  return rows.length > 0;
}
