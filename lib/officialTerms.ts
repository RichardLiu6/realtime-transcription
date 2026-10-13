// AI term suggestions, kept anonymously (no email) so the admin can reuse
// what was already paid for, and the official term packs the admin
// publishes from them for everyone. Server only; Postgres (lib/meetings/db).

import { randomBytes } from "crypto";
import { meetingsAvailable, query } from "@/lib/meetings/db";
import type { TermPack } from "@/lib/termPackTypes";
import { cleanTerms } from "@/lib/termPacks";
import { splitTermInput } from "@/lib/contextTerms";

// Official packs are curated: more room than a user's own pack
export const MAX_OFFICIAL_TERMS = 400;

// Terms as an array, or pasted text (one per line, or , ， 、 ; ；); "a=b=c"
// entries stay one term in several languages
export function termsFrom(value: unknown): string[] | null {
  return cleanTerms(typeof value === "string" ? splitTermInput(value) : value, MAX_OFFICIAL_TERMS);
}

export interface TermSuggestion {
  id: string;
  createdAt: string;
  title: string;
  description: string;
  languages: string[];
  terms: string[];
}

export interface OfficialPack extends TermPack {
  enabled: boolean;
  updatedAt: string;
}

const newId = () => randomBytes(9).toString("base64url");

// Best effort: a failed write never fails the suggestion itself
export async function recordSuggestion(s: { title: string; description: string; languages: string[]; terms: string[] }) {
  if (!meetingsAvailable() || s.terms.length === 0) return;
  try {
    await query(
      `INSERT INTO term_suggestions (id, title, description, languages, terms) VALUES ($1, $2, $3, $4, $5)`,
      [newId(), s.title, s.description, JSON.stringify(s.languages), JSON.stringify(s.terms)]
    );
  } catch (error) {
    console.error("[terms] recording the suggestion failed:", error);
  }
}

interface SuggestionRow {
  id: string;
  created_at: Date;
  title: string;
  description: string;
  languages: string[];
  terms: string[];
}

// Newest first; `q` matches the title, the description or any term
export async function listSuggestions(q: string, limit: number): Promise<TermSuggestion[]> {
  const rows = await query<SuggestionRow>(
    `SELECT id, created_at, title, description, languages, terms FROM term_suggestions
      WHERE $1 = '' OR title ILIKE '%' || $1 || '%' OR description ILIKE '%' || $1 || '%' OR terms::text ILIKE '%' || $1 || '%'
      ORDER BY created_at DESC LIMIT $2`,
    [q, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: new Date(r.created_at).toISOString(),
    title: r.title,
    description: r.description,
    languages: r.languages,
    terms: r.terms,
  }));
}

interface PackRow {
  id: string;
  name: string;
  languages: string[];
  terms: string[];
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

const toPack = (r: PackRow): OfficialPack => ({
  id: r.id,
  name: r.name,
  languages: r.languages,
  terms: r.terms,
  enabled: r.enabled,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
});

export async function listOfficialPacks(onlyEnabled: boolean): Promise<OfficialPack[]> {
  const rows = await query<PackRow>(
    `SELECT * FROM official_term_packs ${onlyEnabled ? "WHERE enabled" : ""} ORDER BY created_at`
  );
  return rows.map(toPack);
}

export async function createOfficialPack(p: { name: string; languages: string[]; terms: string[] }): Promise<OfficialPack> {
  const rows = await query<PackRow>(
    `INSERT INTO official_term_packs (id, name, languages, terms) VALUES ($1, $2, $3, $4) RETURNING *`,
    [newId(), p.name, JSON.stringify(p.languages), JSON.stringify(p.terms.slice(0, MAX_OFFICIAL_TERMS))]
  );
  return toPack(rows[0]);
}

// Rename, switch on/off, replace the terms, or add terms (deduplicated,
// case-insensitive) and languages
export async function updateOfficialPack(
  id: string,
  change: { name?: string; enabled?: boolean; terms?: string[]; addTerms?: string[]; addLanguages?: string[] }
): Promise<OfficialPack | null> {
  const current = (await query<PackRow>(`SELECT * FROM official_term_packs WHERE id = $1`, [id]))[0];
  if (!current) return null;
  let terms = change.terms ?? current.terms;
  if (change.addTerms) {
    const seen = new Set(terms.map((t) => t.toLowerCase()));
    terms = [...terms, ...change.addTerms.filter((t) => !seen.has(t.toLowerCase()))];
  }
  const languages = Array.from(new Set([...current.languages, ...(change.addLanguages ?? [])]));
  const rows = await query<PackRow>(
    `UPDATE official_term_packs SET name = $2, enabled = $3, terms = $4, languages = $5, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [
      id,
      change.name ?? current.name,
      change.enabled ?? current.enabled,
      JSON.stringify(terms.slice(0, MAX_OFFICIAL_TERMS)),
      JSON.stringify(languages),
    ]
  );
  return rows[0] ? toPack(rows[0]) : null;
}

export async function deleteOfficialPack(id: string): Promise<boolean> {
  const rows = await query(`DELETE FROM official_term_packs WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}
