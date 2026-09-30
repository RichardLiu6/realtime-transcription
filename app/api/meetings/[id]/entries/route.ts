import { NextRequest, NextResponse } from "next/server";
import { guardMeeting, serverError } from "@/lib/meetings/guard";
import { saveEntries } from "@/lib/meetings/repo";
import type { MeetingSettings, SavedEntry, SavedSpeaker } from "@/lib/meetings/types";

type Params = { params: Promise<{ id: string }> };

const MAX_ENTRIES = 300;
const MAX_BODY_BYTES = 3_500_000; // under Vercel's 4.5 MB request limit

function cleanEntry(v: unknown): SavedEntry | null {
  const e = v as Partial<SavedEntry>;
  if (typeof e?.id !== "string" || !e.id || e.id.startsWith("_") || e.id.length > 64) return null;
  if (typeof e.originalText !== "string" || typeof e.startMs !== "number") return null;
  const translations =
    e.translations && typeof e.translations === "object"
      ? Object.fromEntries(Object.entries(e.translations).filter(([k, t]) => typeof k === "string" && typeof t === "string"))
      : undefined;
  return {
    id: e.id,
    speaker: typeof e.speaker === "string" ? e.speaker : "",
    language: typeof e.language === "string" ? e.language : "",
    originalText: e.originalText,
    ...(typeof e.translatedText === "string" && e.translatedText ? { translatedText: e.translatedText } : {}),
    ...(translations ? { translations } : {}),
    ...(e.translationProvisional === true ? { translationProvisional: true } : {}),
    startMs: Math.max(0, Math.round(e.startMs)),
    endMs: typeof e.endMs === "number" ? Math.max(0, Math.round(e.endMs)) : Math.round(e.startMs),
    at: typeof e.at === "number" ? e.at : Date.now(),
  };
}

// Owner (the recording page): autosave changed sentences, speakers, settings
export async function PUT(req: NextRequest, { params }: Params) {
  const g = await guardMeeting(req, (await params).id, "owner");
  if ("response" in g) return g.response;
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: { entries?: unknown; speakers?: unknown; settings?: unknown; durationMs?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const list = Array.isArray(body.entries) ? body.entries : [];
  if (list.length > MAX_ENTRIES) return NextResponse.json({ error: "Too many entries" }, { status: 413 });
  const entries = list.map(cleanEntry).filter((e): e is SavedEntry => e !== null);
  const speakers = Array.isArray(body.speakers)
    ? (body.speakers as SavedSpeaker[])
        .filter((s) => typeof s?.id === "string" && typeof s?.label === "string" && typeof s?.color === "string")
        .slice(0, 100)
        .map((s) => ({ id: s.id, label: s.label.slice(0, 80), color: s.color }))
    : undefined;
  const settings =
    body.settings && typeof body.settings === "object" ? (body.settings as Partial<MeetingSettings>) : undefined;
  const durationMs = typeof body.durationMs === "number" ? Math.max(0, Math.round(body.durationMs)) : undefined;
  try {
    await saveEntries(g.id, entries, { speakers, settings, durationMs });
    return NextResponse.json({ saved: entries.length });
  } catch (error) {
    return serverError("save", error);
  }
}
