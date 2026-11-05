// A user's saved term pack, as the API returns it
export interface TermPack {
  id: string;
  name: string;
  languages: string[];
  terms: string[];
  // What the pack is for (the meeting it was made for): helps the speech
  // engine and translation recognise the subject
  topic?: string;
  createdAt: string; // ISO
}

export const MAX_TOPIC = 300;

// A meeting or pack topic as stored and sent: one line, at most MAX_TOPIC
export function cleanTopic(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_TOPIC) : "";
}

// Selected packs share the stored preset selection, as "u:<id>"
export const USER_PACK_PREFIX = "u:";
// Official packs (published by the admin) in the same selection, as "o:<id>"
export const OFFICIAL_PACK_PREFIX = "o:";
