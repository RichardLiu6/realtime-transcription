// A saved meeting as Markdown or plain text, for the API and the CLI.
// Server-safe (no DOM); the page's own export is lib/exportBilingual.ts.

import type { MeetingDetail } from "@/lib/meetings/types";

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function meetingTitle(m: MeetingDetail): string {
  return m.title || `Untitled · ${m.createdAt.slice(0, 16).replace("T", " ")} UTC`;
}

// The language a two-way / one-way sentence was translated into (saved
// without it): the other of the two, or the one-way target
function targetOf(m: MeetingDetail, spoken: string): string {
  const { translationMode, languageA = [], languageB = "" } = m.settings;
  if (translationMode === "one_way") return languageB || "translation";
  const a = languageA.find((l) => l !== "*") ?? "";
  if (spoken && spoken === languageB) return a || "translation";
  return languageB || "translation";
}

// Each sentence with its speaker's name, time and translations
function lines(m: MeetingDetail) {
  const names = new Map(m.speakers.map((s) => [s.id, s.label]));
  return m.entries.map((e) => ({
    time: clock(e.startMs),
    speaker: names.get(e.speaker) ?? e.speaker,
    language: e.language,
    text: e.originalText,
    translations: e.translations ?? (e.translatedText ? { [targetOf(m, e.language)]: e.translatedText } : {}),
  }));
}

export function meetingMarkdown(m: MeetingDetail): string {
  const out = [`# ${meetingTitle(m)}`, ""];
  out.push(`- Date: ${m.createdAt}`, `- Duration: ${clock(m.durationMs)}`, `- Sentences: ${m.entryCount}`);
  if (m.settings.topic) out.push(`- Topic: ${m.settings.topic}`);
  out.push("", "## Transcript", "");
  for (const l of lines(m)) {
    out.push(`**[${l.time}] ${l.speaker}**${l.language ? ` (${l.language})` : ""}: ${l.text}`);
    for (const [lang, text] of Object.entries(l.translations)) {
      if (text && text !== l.text) out.push(`> ${lang}: ${text}`);
    }
    out.push("");
  }
  if (m.summary) out.push("## Summary", "", m.summary, "");
  return out.join("\n");
}

export function meetingText(m: MeetingDetail): string {
  const out = [meetingTitle(m), `${m.createdAt} · ${clock(m.durationMs)}`];
  if (m.settings.topic) out.push(`Topic: ${m.settings.topic}`);
  out.push("");
  for (const l of lines(m)) {
    out.push(`[${l.time}] ${l.speaker}: ${l.text}`);
    for (const [lang, text] of Object.entries(l.translations)) {
      if (text && text !== l.text) out.push(`    ${lang}: ${text}`);
    }
  }
  if (m.summary) out.push("", "Summary", m.summary);
  return out.join("\n") + "\n";
}
