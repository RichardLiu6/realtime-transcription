// A model stuck in a loop: "Hello, can you see me? Wait, can you hear me?
// Wait, can you see me? Wait, can you hear me? …" until the token limit
// (Seed 2.0 Mini, 14 source characters → 900 tokens, 2026-11-25). Seen only
// on short sentences so far; the answer has to be both repetitive and far
// longer than its source warrants, so a speaker's own repetition ("喂喂喂" →
// "Hello? Hello? Hello?") is not one.

// A unit of 6+ characters repeated back to back at least 3 times
const LOOP = /(.{6,160}?)(?:\s*\1){2,}/u;

// Far longer than a translation of the source can be (Chinese → English runs
// about 3–4× the characters; this leaves room for that)
const tooLong = (text: string, sourceChars: number) => text.length > 6 * sourceChars + 80;

export function isDegenerate(text: string, sourceChars: number): boolean {
  return tooLong(text, sourceChars) && LOOP.test(text.replace(/\s+/g, " "));
}

// Last resort when a second model loops too: every repeated run cut to its
// first occurrence, then the length capped, ending in …
export function collapseRepeats(text: string, sourceChars: number): string {
  let out = text.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 5 && LOOP.test(out); i++) out = out.replace(LOOP, "$1").trim();
  const cap = 4 * sourceChars + 40;
  return out.length > cap ? `${out.slice(0, cap).trimEnd()}…` : out;
}
