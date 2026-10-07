// Saved meetings: queries and access rules. Server only.
//
// Access: the owner (who recorded it) can do everything; people it is
// shared with (by email) can read it. Admins see a content-free list of
// all meetings (/api/admin/meetings), not the meetings themselves.

import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { query, transaction, RETENTION_DAYS } from "@/lib/meetings/db";
import { deleteRecordingFiles } from "@/lib/meetings/audio";
import type {
  MeetingDetail,
  MeetingRecording,
  MeetingSettings,
  MeetingSummary,
  SavedEntry,
  SavedSpeaker,
} from "@/lib/meetings/types";

export interface User {
  email: string;
}

// The logged-in user; guests (meeting-code logins) have no saved meetings
export async function currentUser(req: NextRequest): Promise<User | null> {
  const payload = await verifyToken(req.cookies.get("auth_token")?.value ?? "");
  const email = typeof payload?.email === "string" ? payload.email.toLowerCase() : "";
  if (!email || payload?.role === "guest" || email === "guest") return null;
  return { email };
}

export type Access = "owner" | "shared";

export async function accessOf(id: string, email: string): Promise<Access | null> {
  const rows = await query<{ owner_email: string; shared: boolean }>(
    `SELECT owner_email,
            EXISTS (SELECT 1 FROM meeting_shares s WHERE s.meeting_id = m.id AND s.email = $2) AS shared
       FROM meetings m WHERE id = $1 AND expires_at > now()`,
    [id, email]
  );
  const m = rows[0];
  if (!m) return null;
  if (m.owner_email === email) return "owner";
  return m.shared ? "shared" : null;
}

export async function createMeeting(owner: string, settings: Partial<MeetingSettings>): Promise<string> {
  const id = randomBytes(16).toString("base64url");
  await query(
    `INSERT INTO meetings (id, owner_email, settings, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
    [id, owner, JSON.stringify(settings), RETENTION_DAYS]
  );
  return id;
}

interface SummaryRow {
  id: string;
  title: string;
  owner_email: string;
  created_at: Date;
  duration_ms: number;
  entry_count: number;
  recording_count: string;
}

function toSummary(r: SummaryRow, email: string): MeetingSummary {
  return {
    id: r.id,
    title: r.title,
    ownerEmail: r.owner_email,
    createdAt: new Date(r.created_at).toISOString(),
    durationMs: r.duration_ms,
    entryCount: r.entry_count,
    recordingCount: Number(r.recording_count),
    shared: r.owner_email !== email,
  };
}

// The user's meetings and those shared with them, newest first. A search
// matches the title or any sentence (original or translation). Meetings
// with nothing in them (recording started, nothing said) are left out.
export async function listMeetings(email: string, search = ""): Promise<MeetingSummary[]> {
  const q = search.trim();
  const rows = await query<SummaryRow>(
    `SELECT m.id, m.title, m.owner_email, m.created_at, m.duration_ms, m.entry_count,
            (SELECT count(*) FROM meeting_recordings r WHERE r.meeting_id = m.id) AS recording_count
       FROM meetings m
      WHERE m.expires_at > now()
        AND (m.owner_email = $1 OR EXISTS (SELECT 1 FROM meeting_shares s WHERE s.meeting_id = m.id AND s.email = $1))
        AND (m.entry_count > 0 OR EXISTS (SELECT 1 FROM meeting_recordings r WHERE r.meeting_id = m.id))
        AND ($2 = '' OR m.title ILIKE '%' || $2 || '%'
             OR EXISTS (SELECT 1 FROM meeting_entries e WHERE e.meeting_id = m.id AND e.data::text ILIKE '%' || $2 || '%'))
      ORDER BY m.created_at DESC
      LIMIT 200`,
    [email, q]
  );
  return rows.map((r) => toSummary(r, email));
}

export async function getMeeting(id: string, email: string, access: Access): Promise<MeetingDetail | null> {
  const rows = await query<
    SummaryRow & { expires_at: Date; settings: Partial<MeetingSettings>; speakers: SavedSpeaker[]; summary: string | null }
  >(
    `SELECT m.*, (SELECT count(*) FROM meeting_recordings r WHERE r.meeting_id = m.id) AS recording_count
       FROM meetings m WHERE m.id = $1`,
    [id]
  );
  const m = rows[0];
  if (!m) return null;
  const [entries, recordings, shares] = await Promise.all([
    query<{ data: SavedEntry }>(`SELECT data FROM meeting_entries WHERE meeting_id = $1 ORDER BY start_ms, id`, [id]),
    query<{ idx: number; content_type: string; size_bytes: string; offset_ms: number; duration_ms: number }>(
      `SELECT idx, content_type, size_bytes, offset_ms, duration_ms FROM meeting_recordings WHERE meeting_id = $1 ORDER BY offset_ms, idx`,
      [id]
    ),
    access === "owner"
      ? query<{ email: string }>(`SELECT email FROM meeting_shares WHERE meeting_id = $1 ORDER BY created_at`, [id])
      : Promise.resolve([]),
  ]);
  return {
    ...toSummary(m, email),
    expiresAt: new Date(m.expires_at).toISOString(),
    settings: m.settings ?? {},
    speakers: m.speakers ?? [],
    summary: m.summary,
    entries: entries.map((e) => e.data),
    recordings: recordings.map(
      (r): MeetingRecording => ({
        idx: r.idx,
        contentType: r.content_type,
        sizeBytes: Number(r.size_bytes),
        offsetMs: r.offset_ms,
        durationMs: r.duration_ms,
      })
    ),
    shares: shares.map((s) => s.email),
    isOwner: access === "owner",
  };
}

// Autosave: upsert changed sentences and the meeting's running state
export async function saveEntries(
  id: string,
  entries: SavedEntry[],
  meta: { speakers?: SavedSpeaker[]; settings?: Partial<MeetingSettings>; durationMs?: number }
): Promise<void> {
  await transaction(async (c) => {
    if (entries.length > 0) {
      await c.query(
        `INSERT INTO meeting_entries (meeting_id, id, start_ms, data)
         SELECT $1, e->>'id', COALESCE((e->>'startMs')::numeric::integer, 0), e
           FROM jsonb_array_elements($2::jsonb) e
         ON CONFLICT (meeting_id, id) DO UPDATE SET
           start_ms = EXCLUDED.start_ms,
           -- Translations added later (补翻译) survive the recording page
           -- re-saving the sentence without them; incoming ones win
           data = CASE WHEN meeting_entries.data ? 'translations'
             THEN EXCLUDED.data || jsonb_build_object('translations',
               (meeting_entries.data->'translations') || COALESCE(EXCLUDED.data->'translations', '{}'::jsonb))
             ELSE EXCLUDED.data END`,
        [id, JSON.stringify(entries)]
      );
    }
    await c.query(
      `UPDATE meetings SET
         updated_at = now(),
         entry_count = (SELECT count(*) FROM meeting_entries WHERE meeting_id = $1),
         duration_ms = GREATEST(duration_ms, COALESCE($2::integer, 0)),
         speakers = COALESCE($3::jsonb, speakers),
         settings = COALESCE($4::jsonb, settings)
       WHERE id = $1`,
      [
        id,
        meta.durationMs ?? null,
        meta.speakers ? JSON.stringify(meta.speakers) : null,
        meta.settings ? JSON.stringify(meta.settings) : null,
      ]
    );
  });
}

export async function updateMeeting(
  id: string,
  patch: { title?: string; speakers?: SavedSpeaker[]; summary?: string | null }
): Promise<void> {
  await query(
    `UPDATE meetings SET
       title = COALESCE($2, title),
       speakers = COALESCE($3::jsonb, speakers),
       summary = CASE WHEN $4 THEN $5 ELSE summary END,
       updated_at = now()
     WHERE id = $1`,
    [
      id,
      patch.title ?? null,
      patch.speakers ? JSON.stringify(patch.speakers) : null,
      patch.summary !== undefined,
      patch.summary ?? null,
    ]
  );
}

// Deletes the meeting's rows and its recording files
export async function deleteMeetings(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const files = await query<{ pathname: string; url: string }>(
    `SELECT pathname, url FROM meeting_recordings WHERE meeting_id = ANY($1)`,
    [ids]
  );
  await deleteRecordingFiles(files);
  await query(`DELETE FROM meetings WHERE id = ANY($1)`, [ids]);
}

export async function addShare(id: string, email: string): Promise<void> {
  await query(`INSERT INTO meeting_shares (meeting_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, email]);
}

export async function removeShare(id: string, email: string): Promise<void> {
  await query(`DELETE FROM meeting_shares WHERE meeting_id = $1 AND email = $2`, [id, email]);
}

export async function addRecording(
  id: string,
  r: { idx: number; pathname: string; url: string; contentType: string; sizeBytes: number; offsetMs: number; durationMs: number }
): Promise<void> {
  await query(
    `INSERT INTO meeting_recordings (meeting_id, idx, pathname, url, content_type, size_bytes, offset_ms, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (meeting_id, idx) DO UPDATE SET
       pathname = EXCLUDED.pathname, url = EXCLUDED.url, content_type = EXCLUDED.content_type,
       size_bytes = EXCLUDED.size_bytes, offset_ms = EXCLUDED.offset_ms, duration_ms = EXCLUDED.duration_ms`,
    [id, r.idx, r.pathname, r.url, r.contentType, r.sizeBytes, r.offsetMs, r.durationMs]
  );
  await query(`UPDATE meetings SET updated_at = now() WHERE id = $1`, [id]);
}

export async function recordingFile(
  id: string,
  idx: number
): Promise<{ pathname: string; url: string; contentType: string } | null> {
  const rows = await query<{ pathname: string; url: string; content_type: string }>(
    `SELECT pathname, url, content_type FROM meeting_recordings WHERE meeting_id = $1 AND idx = $2`,
    [id, idx]
  );
  return rows[0] ? { pathname: rows[0].pathname, url: rows[0].url, contentType: rows[0].content_type } : null;
}

// Daily cleanup: meetings past their retention, and empty ones (recording
// started, nothing said or recorded) older than a day
export async function cleanupMeetings(): Promise<number> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM meetings m
      WHERE expires_at <= now()
         OR (created_at < now() - interval '1 day' AND entry_count = 0
             AND NOT EXISTS (SELECT 1 FROM meeting_recordings r WHERE r.meeting_id = m.id))
      LIMIT 500`
  );
  await deleteMeetings(rows.map((r) => r.id));
  return rows.length;
}

// Admin: every meeting without its content (no title, no text)
export async function adminListMeetings(): Promise<
  { ownerEmail: string; createdAt: string; durationMs: number; entryCount: number; recordingBytes: number; sharedWith: number }[]
> {
  const rows = await query<{
    owner_email: string;
    created_at: Date;
    duration_ms: number;
    entry_count: number;
    recording_bytes: string | null;
    shared_with: string;
  }>(
    `SELECT m.owner_email, m.created_at, m.duration_ms, m.entry_count,
            (SELECT sum(size_bytes) FROM meeting_recordings r WHERE r.meeting_id = m.id) AS recording_bytes,
            (SELECT count(*) FROM meeting_shares s WHERE s.meeting_id = m.id) AS shared_with
       FROM meetings m
      WHERE m.expires_at > now() AND m.entry_count > 0
      ORDER BY m.created_at DESC
      LIMIT 500`
  );
  return rows.map((r) => ({
    ownerEmail: r.owner_email,
    createdAt: new Date(r.created_at).toISOString(),
    durationMs: r.duration_ms,
    entryCount: r.entry_count,
    recordingBytes: Number(r.recording_bytes ?? 0),
    sharedWith: Number(r.shared_with),
  }));
}
