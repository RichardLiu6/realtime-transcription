// A user's saved term pack, as the API returns it
export interface TermPack {
  id: string;
  name: string;
  languages: string[];
  terms: string[];
  createdAt: string; // ISO
}

// Selected packs share the stored preset selection, as "u:<id>"
export const USER_PACK_PREFIX = "u:";
// Official packs (published by the admin) in the same selection, as "o:<id>"
export const OFFICIAL_PACK_PREFIX = "o:";
